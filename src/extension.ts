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
        'taskOutlinePlus.executeTask', function (task) {
            console.log(task);
            vscode.tasks.executeTask(task).then(function (value) {
                return value;
            }, function (e) {
                console.error('I am error');
            });
        });
}

export function deactivate (): void {

}
