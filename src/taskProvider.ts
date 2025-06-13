import * as vscode from 'vscode';
import * as fs from 'fs';
import * as JSON5 from 'json5';

export class GroupTreeItem extends vscode.TreeItem {
    children: TreeTask[] = [];

    constructor (groupName: string) {
        super(groupName, vscode.TreeItemCollapsibleState.Expanded);
    }
}

export class WorkspaceTreeItem extends vscode.TreeItem {
    public childrenObject: { [key: string]: GroupTreeItem } = {};
    private static readonly otherGroups = 'other-tasks';

    constructor (label: string) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
    }

    public async addChildren (child: any): Promise<void> {
        if (child.group !== null) {
            if (this.childrenObject[child.group] === undefined) {
                const group = new GroupTreeItem(child.group);
                this.childrenObject[child.group] = group;
            }
            this.childrenObject[child.group].children.push(child);
        } else {
            if (this.childrenObject[
                WorkspaceTreeItem.otherGroups] === undefined) {
                const group = new GroupTreeItem(WorkspaceTreeItem.otherGroups);
                this.childrenObject[WorkspaceTreeItem.otherGroups] = group;
            }
            this.childrenObject[
                WorkspaceTreeItem.otherGroups].children.push(child);
        }
    }

    public get children (): Array<TreeTask | GroupTreeItem> {
        return Object.values(this.childrenObject);
    }
}

export class TaskTreeDataProvider implements
vscode.TreeDataProvider<TreeTask | GroupTreeItem | WorkspaceTreeItem> {
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
                    if (typeof _task.scope === "number") {
                        _workSpaceName = vscode.workspace.workspaceFolders[
                            _task.scope
                        ].name;
                    } else if (typeof _task.scope !== "string") {
                        _workSpaceName = (
                            _task.scope as vscode.WorkspaceFolder
                        ).name;
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
            // we will show the list, make sure to have the backspace back
            await vscode
                .commands.executeCommand(
                    "setContext",
                    "inCmdlineMode",
                    false
                );

            // show option list
            let _pick = await vscode.window.showQuickPick(_matches);
            if (_pick != null) {
                let _name = "";
                if (_pick.includes("(") && _pick.includes(")")) {
                    // eslint-disable-next-line max-len
                    // we get the match for the task name and the (workspace name)
                    const _rawTask = _pick.split(" ")[0];
                    _name =
                        _pick.split(" ")[1].replace("(", "").replace(")", "");
                    _pick = _rawTask;
                } else {
                    _name = _pick;
                }

                this._statusBarBuffer = ["/", ..._pick.split("")];
                this._statusBarI.text = this._statusBarBuffer.join("");

                // execute it
                const tasks = await vscode.tasks.fetchTasks();
                this._statusBarBuffer.shift();

                let _task: vscode.Task[] = [];
                const folders = vscode.workspace.workspaceFolders;

                if (folders != null && folders.length > 1) {
                    _task = tasks.filter(t => {
                        if (t.name !== this._statusBarBuffer.join("")) {
                            return false;
                        }

                        if (typeof t.scope === "number") {
                            return folders[t.scope]?.name === _name;
                        } else if (typeof t.scope !== "string") {
                            return (
                                t.scope as vscode.WorkspaceFolder
                            ).name === _name;
                        }

                        return false;
                    });
                } else {
                    _task = tasks.filter(
                        t => t.name === this._statusBarBuffer.join("")
                    );
                }

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

    private async sortElements (
        elements: Array<WorkspaceTreeItem | GroupTreeItem | TreeTask>
    ): Promise<Array<WorkspaceTreeItem | GroupTreeItem | TreeTask>> {
        elements.sort((a, b) => {
            const getLabel = (
                item: WorkspaceTreeItem | GroupTreeItem | TreeTask
            ): string => {
                const label = typeof item.label === "string"
                    ? item.label
                    : item.label?.label ?? "";
                return label;
            };

            const aLabel = getLabel(a);
            const bLabel = getLabel(b);

            if (aLabel === "other-tasks" && bLabel !== "other-tasks") return 1;
            if (bLabel === "other-tasks" && aLabel !== "other-tasks") return -1;

            return aLabel.localeCompare(bLabel);
        });

        return elements;
    }

    private async getLowestLevel (
        elements: Array<WorkspaceTreeItem | TreeTask | GroupTreeItem>
    ): Promise<Array<WorkspaceTreeItem | TreeTask | GroupTreeItem>> {
        if (
            elements.length === 1 &&
            !(elements[0] instanceof TreeTask)
        ) {
            return await this.getLowestLevel(elements[0].children);
        }
        return elements;
    }

    public async getChildren (
        task?: TreeTask | WorkspaceTreeItem | GroupTreeItem):
        Promise<Array<TreeTask | GroupTreeItem | WorkspaceTreeItem>> {
        if (task instanceof WorkspaceTreeItem ||
            task instanceof GroupTreeItem) {
            // If this is a workspace item, return only its children
            return await this.sortElements(
                await this.getLowestLevel(task.children));
        }

        // Otherwise, return the top-level list
        let tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
        tasks = tasks.filter(t => t.source === "Workspace");

        const taskElements: Array<WorkspaceTreeItem | TreeTask> = [];
        const taskFolders: { [key: string]: WorkspaceTreeItem } = {};

        for (const task of tasks) {
            const _task = new TreeTask(
                task.definition.type,
                task.name,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'taskOutlinePlus.executeTask',
                    title: "Execute",
                    arguments: [task, task.scope]
                },
                task.scope,
                (task as any).presentationOptions?.group ?? null
            );

            if (task.detail != null) {
                _task.tooltip = task.detail;
            }

            if (!_task.hide || this._unhide) {
                if (_task.workspace !== null) {
                    if (taskFolders[_task.workspace] === undefined) {
                        const ws = new WorkspaceTreeItem(_task.workspace);
                        taskFolders[_task.workspace] = ws;
                        taskElements.push(ws);
                    }
                    await taskFolders[_task.workspace].addChildren(_task);
                } else {
                    taskElements.push(_task);
                }
            }
        }

        return await this.sortElements(await this.getLowestLevel(taskElements));
    }

    getTreeItem (task: TreeTask | WorkspaceTreeItem | GroupTreeItem):
    vscode.TreeItem {
        return task;
    }
}

export class TreeTask extends vscode.TreeItem {
    type: string;
    hide: boolean = false;
    workspace: string | null = null;
    group: string | undefined;

    constructor (
        type: string,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command,
        workspace?: vscode.WorkspaceFolder | vscode.TaskScope,
        group?: string
    ) {
        super(label, collapsibleState);
        this.type = type;
        this.command = command;
        this.label = `${this.label as string}`;
        this.group = group;
        if (typeof workspace === 'object' && workspace !== null) {
            // Multi-root: WorkspaceFolder
            this.workspace = workspace.name;
        } else if (workspace === vscode.TaskScope.Workspace) {
            // Single-root workspace
            this.workspace = vscode.workspace.name ?? "root";
        }

        const multiRoot = vscode.workspace.workspaceFolders!.length > 1;

        for (const _workspace of vscode.workspace.workspaceFolders!) {
            let _tasksJson;
            // Make sure that the task is not hidden by reading the workspace
            // tasks.json file. Also, on a multiroot workspace the tasks may
            // be defined just on the code-workspace file and there may not
            // be a .vscode/tasks.json file
            if (
                multiRoot &&
                // eslint-disable-next-line max-len
                fs.existsSync(`${_workspace.uri.fsPath}/${_workspace.name}.code-workspace`)
            ) {
                _tasksJson = JSON5.parse(
                    fs.readFileSync(
                        // eslint-disable-next-line max-len
                        `${_workspace.uri.fsPath}/${_workspace.name}.code-workspace`, 'utf8'
                    )
                ).tasks;
                // If it exists, concatenate the tasks from both places
                if (fs.existsSync(
                    `${_workspace.uri.fsPath}/.vscode/tasks.json`)) {
                    const _tasksJsonFile = JSON5.parse(
                        fs.readFileSync(
                            // eslint-disable-next-line max-len
                            `${_workspace.uri.fsPath}/.vscode/tasks.json`, 'utf8'
                        )
                    );
                    _tasksJson.tasks = [
                        ..._tasksJson.tasks,
                        ..._tasksJsonFile.tasks
                    ]
                }
            } else {
                _tasksJson = JSON5.parse(
                    fs.readFileSync(
                        `${_workspace.uri.fsPath}/.vscode/tasks.json`, 'utf8'
                    )
                );
            }

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
    }
}
