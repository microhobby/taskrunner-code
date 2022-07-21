import * as vscode from 'vscode';

export class TaskTreeDataProvider implements vscode.TreeDataProvider<TreeTask> {
    private readonly _onDidChangeTreeData: vscode.EventEmitter<TreeTask | null>
    = new vscode.EventEmitter<TreeTask | null>();

    readonly onDidChangeTreeData: vscode.Event<TreeTask | null>
    = this._onDidChangeTreeData.event;

    private readonly autoRefresh: boolean = true;

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

    public async getChildren (task?: TreeTask): Promise<TreeTask[]> {
        let tasks: vscode.Task[] = await vscode.tasks.fetchTasks();
        tasks = tasks.filter(t => t.source === "Workspace");

        const taskNames: TreeTask[] = [];
        if (tasks.length !== 0) {
            for (var i = 0; i < tasks.length; i++) {
                if (tasks[i].detail !== "hide") {
                    taskNames[i] = new TreeTask(
                        tasks[i].definition.type,
                        tasks[i].name,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'taskOutlinePlus.executeTask',
                            title: "Execute",
                            arguments: [tasks[i]]
                        }
                    );
                }
            }
        }
        return taskNames;
    }

    getTreeItem (task: TreeTask): vscode.TreeItem {
        return task;
    }
}

class TreeTask extends vscode.TreeItem {
    type: string;

    constructor (
        type: string,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.type = type;
        this.command = command;
    }
}
