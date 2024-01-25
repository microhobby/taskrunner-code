import * as vscode from 'vscode';
import * as fs from 'fs';
import * as JSON5 from 'json5';

export class TaskTreeDataProvider implements vscode.TreeDataProvider<TreeTask> {
    private readonly _context: vscode.ExtensionContext;
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeTask | null>
    = new vscode.EventEmitter<TreeTask | null>();

    readonly onDidChangeTreeData: vscode.Event<TreeTask | null>
    = this._onDidChangeTreeData.event;

    private readonly autoRefresh: boolean = true;
    private _unhide: boolean = false;
    private readonly _statusBarI = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, 0
    );

    private _statusBarBuffer: string[] = [];

    private _registeredType: vscode.Disposable | null = null;

    constructor (private readonly context: vscode.ExtensionContext) {
        this._context = context;
        const autoRefreshConfig: boolean | undefined = vscode.workspace
            .getConfiguration('taskOutlinePlus').get('autorefresh');

        if (autoRefreshConfig === undefined) {
            // default is true
            this.autoRefresh = true;
        } else {
            this.autoRefresh = autoRefreshConfig;
        }
    }

    refresh (): void {
        this._onDidChangeTreeData.fire(null);
    }

    unhide (): void {
        this._unhide = !this._unhide;
        this._onDidChangeTreeData.fire(null);
    }

    public async putTaskCmd (): Promise<void> {
        // set the focus on the statusbar
        this._statusBarI.text = "/";
        this._statusBarI.show();
        this._statusBarBuffer.push("/");

        await vscode
            .commands.executeCommand(
                "setContext",
                "inCmdlineMode",
                true
            );

        this._registeredType = vscode.commands.registerCommand(
            "type", async e => {
                console.log(e);

                if (e.text !== "\n") {
                    this._statusBarBuffer.push(e.text);
                    this._statusBarI.text = this._statusBarBuffer.join("");
                } else {
                    // execute it
                    const tasks = await vscode.tasks.fetchTasks();
                    this._statusBarBuffer.shift();
                    const _task = tasks.filter(
                        t => t.name === this._statusBarBuffer.join("")
                    );

                    if (_task.length > 0) {
                        void vscode.tasks.executeTask(_task[0]);
                        await this.exitTaskCmd();
                    } else {
                        await this.exitTaskCmd();
                        this._statusBarI.text = "-- UNDEFINED TASK --";
                    }
                }
            });
    }

    public async exitTaskCmd (): Promise<void> {
        this._registeredType?.dispose();
        await vscode
            .commands.executeCommand(
                "setContext",
                "inCmdlineMode",
                false
            );
        this._statusBarBuffer = [];
        this._statusBarI.text = "";
    }

    public async backTaskCmd (): Promise<void> {
        if (this._statusBarBuffer.length > 1) {
            this._statusBarBuffer.pop();
            this._statusBarI.text = this._statusBarBuffer.join("");
        }
    }

    public async tabTaskCmd (): Promise<void> {
        const tasks_ = await vscode.tasks.fetchTasks();
        const tasks = tasks_.filter(t => t.source === "Workspace");
        const _part = this._statusBarBuffer.join("").replace("/", "");

        // algoritm to get the most close match
        let _match: string | null = null;
        const _matches: string[] = [];
        let _matchCount: number = 0;
        for (const _task of tasks) {
            if (_task.name.startsWith(_part)) {
                if (_match == null) {
                    _match = _task.name;
                    _matchCount++;
                } else {
                    _matchCount++;
                }

                // in multi-root workspaces we need to label the tasks by folder
                if (
                    vscode.workspace.workspaceFolders != null &&
                    vscode.workspace.workspaceFolders.length > 1
                ) {
                    let _workSpaceName = "";
                    if (typeof _task.scope !== "string") {
                        _workSpaceName =
                            (_task.scope as vscode.WorkspaceFolder).name;
                    }

                    _matches.push(`${_task.name} (${_workSpaceName})`);
                } else {
                    _matches.push(`${_task.name}`);
                }
            }
        }

        if (_match != null && _matchCount === 1) {
            this._statusBarBuffer = ["/", ..._match.split("")];
            this._statusBarI.text = this._statusBarBuffer.join("");
        } else if (_matchCount >= 2) {
            // show option list
            const _pick = await vscode.window.showQuickPick(_matches);
            if (_pick != null) {
                this._statusBarBuffer = ["/", ..._pick.split("")];
                this._statusBarI.text = this._statusBarBuffer.join("");

                // execute it
                const tasks = await vscode.tasks.fetchTasks();
                this._statusBarBuffer.shift();
                const _task = tasks.filter(
                    t => t.name === this._statusBarBuffer.join("")
                );

                if (_task.length > 0) {
                    void vscode.tasks.executeTask(_task[0]);
                    await this.exitTaskCmd();
                } else {
                    await this.exitTaskCmd();
                    this._statusBarI.text = "-- UNDEFINED TASK --";
                }
            }
        }
    }

    public async getChildren (task?: TreeTask): Promise<TreeTask[]> {
        let tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
        tasks = tasks.filter(t => t.source === "Workspace");

        // also read the tasks.json file from the workspace

        let taskNames: TreeTask[] = [];
        if (tasks.length !== 0) {
            for (var i = 0; i < tasks.length; i++) {
                const _task = new TreeTask(
                    tasks[i].definition.type,
                    tasks[i].name,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'taskOutlinePlus.executeTask',
                        title: "Execute",
                        arguments: [tasks[i], tasks[i].scope]
                    },
                    tasks[i].scope
                );

                if (tasks[i].detail != null) {
                    _task.tooltip = tasks[i].detail;
                }

                if (!_task.hide || this._unhide) {
                    taskNames.push(_task);
                }
            }

            // order by name
            taskNames = taskNames.sort((one, two) =>
                (one.label! < two.label! ? -1 : 1)
            );
        }

        return taskNames;
    }

    getTreeItem (task: TreeTask): vscode.TreeItem {
        return task;
    }
}

class TreeTask extends vscode.TreeItem {
    type: string;
    hide: boolean = false;

    constructor (
        type: string,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command,
        workspace?: vscode.WorkspaceFolder | vscode.TaskScope
    ) {
        super(label, collapsibleState);
        this.type = type;
        this.command = command;
        this.label = `${this.label as string}`;

        // take sure that the task is not hidden
        // read the workspace tasks.json file
        for (const _workspace of vscode.workspace.workspaceFolders!) {
            const _tasksJson = JSON5.parse(
                fs.readFileSync(
                    `${_workspace.uri.fsPath}/.vscode/tasks.json`, 'utf8'
                )
            );

            for (const _task of _tasksJson.tasks) {
                if (_task.label === this.label) {
                    this.hide = _task.hide ?? false;

                    // icon
                    if (_task.icon != null && _task.icon.id !== "") {
                        this.iconPath = new vscode.ThemeIcon(
                            _task.icon.id,
                            _task.icon.color
                        );
                    }

                    break;
                }
            }
        }

        // in multi-root workspaces we need to label the tasks by folder
        if (
            vscode.workspace.workspaceFolders != null &&
            vscode.workspace.workspaceFolders.length > 1
        ) {
            if (
                workspace != null &&
                (workspace as vscode.WorkspaceFolder).name != null
            ) {
                this.label +=
                    ` (${(workspace as vscode.WorkspaceFolder).name})`;
            }
        }
    }
}
