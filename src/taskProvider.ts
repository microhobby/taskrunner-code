import * as vscode from 'vscode';
import * as fs from 'fs';
import * as JSON5 from 'json5';

export class TaskTreeDataProvider implements vscode.TreeDataProvider<TreeTask> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeTask | null>
    = new vscode.EventEmitter<TreeTask | null>();

    readonly onDidChangeTreeData: vscode.Event<TreeTask | null>
    = this._onDidChangeTreeData.event;

    private readonly autoRefresh: boolean = true;
    private _unhide: boolean = false;

    constructor (private readonly context: vscode.ExtensionContext) {
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
