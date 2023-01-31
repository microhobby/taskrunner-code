import * as vscode from 'vscode';
import { TaskTreeDataProvider } from './taskProvider'

export function activate (context: vscode.ExtensionContext): object {
    const taskTreeDataProvider = new TaskTreeDataProvider(context);

    vscode.window.registerTreeDataProvider(
        'taskOutlinePlus', taskTreeDataProvider);
    vscode.commands.registerCommand(
        'taskOutlinePlus.refresh', () => taskTreeDataProvider.refresh()
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

    return {
        taskSource () {
            return context.globalState
                .get("______taskRunnerPlusWorkspaceSource______");
        }
    };
}

export function deactivate (): void {

}
