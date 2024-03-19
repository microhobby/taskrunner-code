import * as vscode from 'vscode';
import {
    TaskTreeDataProvider,
    TreeTask
} from './taskProvider'

export function activate (context: vscode.ExtensionContext): object {
    const taskTreeDataProvider = new TaskTreeDataProvider(context);

    // we need all as soon we activate it
    void vscode.tasks.fetchTasks();

    vscode.window.registerTreeDataProvider(
        'taskOutlinePlus', taskTreeDataProvider);
    vscode.commands.registerCommand(
        'taskOutlinePlus.refresh', () => taskTreeDataProvider.refresh()
    );
    vscode.commands.registerCommand(
        'taskOutlinePlus.unhide', () => taskTreeDataProvider.unhide()
    );
    vscode.commands.registerCommand(
        'taskOutlinePlus.showList',
        async () => await taskTreeDataProvider.tabTaskCmd()
    );

    vscode.commands.registerCommand(
        'taskOutlinePlus.goToTask',
        async (
            task: TreeTask
        ) => {
            // TODO: this for now does not work in multi-root workspaces
            if (
                vscode.workspace.workspaceFolders != null &&
                vscode.workspace.workspaceFolders.length > 1
            ) {
                // eslint-disable-next-line max-len
                void vscode.window.showErrorMessage("Sorry, this feature is not available in multi-root workspaces");
                return;
            } else if (vscode.workspace.workspaceFolders != null) {
                const _tasksFile =
                    vscode.Uri.parse(
                        // eslint-disable-next-line max-len
                        `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.vscode/tasks.json`
                    );
                const _tasksFileContent = await vscode.workspace.fs.readFile(
                    _tasksFile
                );

                const _lines = Buffer.from(_tasksFileContent)
                    .toString('utf-8').split('\n');
                let _ln = 0;

                for (const _line of _lines) {
                    if (_line.includes(task.label as string)) {
                        // open on editor in the line
                        void vscode.window.showTextDocument(
                            _tasksFile,
                            {
                                selection: new vscode.Range(
                                    _ln, 0, _ln, 0
                                )
                            }
                        );

                        return;
                    }

                    _ln++;
                }

                return;
            }

            // eslint-disable-next-line max-len
            void vscode.window.showErrorMessage("THIS IS IMPOSSIBLE!!");
        }
    );

    vscode.commands.registerCommand(
        'taskOutlinePlus.executeTask', async function (
            task: vscode.Task,
            scope: vscode.TaskScope | vscode.WorkspaceFolder | undefined
        ) {
            console.log(task);

            // in multi-root workspaces we need to share the source
            if (
                vscode.workspace.workspaceFolders != null &&
                vscode.workspace.workspaceFolders.length > 1
            ) {
                if (
                    scope != null &&
                    (scope as vscode.WorkspaceFolder).name != null
                ) {
                    // eslint-disable-next-line max-len
                    console.log(`storing source: ${(scope as vscode.WorkspaceFolder).name}`);
                    await context.globalState.update(
                        "______taskRunnerPlusWorkspaceSource______",
                        (scope as vscode.WorkspaceFolder).name
                    );
                }
            }

            void vscode.tasks.executeTask(task)
                .then(execution => {
                    vscode.tasks.onDidEndTask(e => {
                        if (e.execution === execution) {
                            // clean up
                            // eslint-disable-next-line max-len
                            console.log(`cleaning store source ${(scope as vscode.WorkspaceFolder).name}`);
                            void context.globalState.update(
                                "______taskRunnerPlusWorkspaceSource______",
                                null
                            );
                        }
                    });
                });
        });

    vscode.commands.registerCommand(
        'taskOutlinePlus.execCmdline', async function () {
            await taskTreeDataProvider.putTaskCmd();
        }
    );

    vscode.commands.registerCommand(
        'taskOutlinePlus.exitCmdline', async function () {
            await taskTreeDataProvider.exitTaskCmd();
        }
    );

    vscode.commands.registerCommand(
        'taskOutlinePlus.backCmdline', async function () {
            await taskTreeDataProvider.backTaskCmd();
        }
    );

    vscode.commands.registerCommand(
        'taskOutlinePlus.tabCmdline', async function () {
            await taskTreeDataProvider.tabTaskCmd();
        }
    );

    return {
        taskSource () {
            return context.globalState
                .get("______taskRunnerPlusWorkspaceSource______");
        }
    };
}

export function deactivate (): void {

}
