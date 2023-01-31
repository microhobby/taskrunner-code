import * as vscode from 'vscode';
import { TaskTreeDataProvider } from './taskProvider'

export function activate (context: vscode.ExtensionContext): void {
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
                    await context.globalState.update(
                        "______taskRunnerPlusWorkspaceSource______",
                        (scope as vscode.WorkspaceFolder).name
                    );
                }
            }

            await vscode.tasks.executeTask(task).then(function (value) {
                return value;
            }, function (e) {
                console.error('I am error');
            });

            // clean up
            await context.globalState.update(
                "______taskRunnerPlusWorkspaceSource______",
                null
            );
        });
}

export function deactivate (): void {

}
