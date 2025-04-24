// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { window } from 'vscode';
import { getActiveFunction, getHelpForCode, submitFeedback } from './utils';
import { title } from 'process';

const HISTORY_COUNT = 3;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "61a-bot" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// let disposable = vscode.commands.registerCommand('61a-bot.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from Socratic CS1 Support!');
	// });
	let isGettingHelp = false;

	let getHelp = vscode.commands.registerCommand('61a-bot.getHelp', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		// console.log("getHelp called!");
		
		let email: string | undefined = vscode.workspace.getConfiguration('61a-bot').get('email');
		if (! email || ! email.match(/@berkeley.edu$/)) {
			let options: vscode.InputBoxOptions = {
				title: "Enter your email",
				prompt: "Enter your email above.",
				placeHolder: "(...@berkeley.edu)",
				validateInput: (value: string) => {
					if (value.match(/@berkeley.edu$/)) {
						return null;
					}
					return "Please enter a valid Berkeley email address.";
				}
			};
		
			let value = await window.showInputBox(options);
			if (!value) {
				return;
			}
			email = value;
			vscode.workspace.getConfiguration('61a-bot').update('email', email, true);

			options = {
				title: "Research Consent",
				prompt: "Can a team led by Prof. Narges Norouzi use your data for research? Your consent is voluntary, and does not affect your ability to use this extension, nor your course grade, and no personally-identifying information will be used. You may withdraw your consent at any time by disabling this option in Settings. For more information visit [https://cs61a.org/articles/61a-bot](https://cs61a.org/articles/61a-bot/#research-consent-optional).",
				placeHolder: "yes / no",
				validateInput: (value: string) => {
					if (value.toLowerCase() === "yes" || value.toLowerCase() === "no") {
						return null;
					}
					return "Please enter \"yes\" to consent to research, or \"no\" otherwise.";
				}
			};

			value = await window.showInputBox(options);
			vscode.workspace.getConfiguration('61a-bot').update('researchConsent', value?.toLowerCase() === "yes", true);
		}

		let options: vscode.InputBoxOptions = {
			title: "Get Help",
			prompt: "Have a specific question?",
			placeHolder: "Enter it here (or leave blank for general advice)",
			ignoreFocusOut: true
		};
		let studentQuery = await window.showInputBox(options);
		if (studentQuery === undefined) {
			return;
		}

		isGettingHelp = true;
		vscode.commands.executeCommand('setContext', '61a-bot.isGettingHelp', isGettingHelp);

		let activeFunction = await getActiveFunction();
		if (! activeFunction) {
			// console.log("Could not find active function");
			vscode.window.showErrorMessage("Could not figure out which question you're working on...is your cursor in the main function for this question?", "Dismiss");
			return null;
		}
		let hwId = vscode.window.activeTextEditor?.document.fileName.match(/hw(\d+)/);
		if (!hwId) {
			// console.log("Could not find hw number in file name");
			vscode.window.showErrorMessage("Could not find hw number in file name...did you rename your file?", "Dismiss");
			return null;
		}
		const hwNum = hwId[1];

		// let activeFunctionCode = activeFunction.text;
		const allCode = vscode.window.activeTextEditor?.document.getText();
		const activeFunctionName = activeFunction.name;

		let helpResponse: {output: string, requestId: string} = {output: "An error occurred", requestId: ""};
		await window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Getting help...",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0 });

			let increment = 0;
			let values = [10, 10, 10, 10, 10, 10, 10, 10, 5, 5, 3, 2, 2, 1, 1, 0]; // total: 80
			let interval = setInterval(() => {
				increment = Math.min(increment + 1, values.length - 1);
				progress.report({ increment: values[increment] });
			}, 1000);

			const requestHistory = context.workspaceState.get(`61a-bot/${activeFunctionName}`) as Array<{code: string, help: string, requestId: string}> || [];
			const priorContext = requestHistory.slice(-HISTORY_COUNT);	

			helpResponse = await getHelpForCode(email || '<unknown>', vscode.workspace.getConfiguration('61a-bot').get('researchConsent') || false, hwNum, activeFunctionName, priorContext.length === 0 ? allCode : undefined, studentQuery,
				priorContext.flatMap((context) => [{role: "user", content: context.code}, {role: "assistant", content: context.help}]).concat([{role: "user", content: allCode || ''}]));

			if (helpResponse.requestId) {
				context.workspaceState.update(`61a-bot/${activeFunctionName}`, requestHistory.concat([{code: allCode || '', help: helpResponse.output, requestId: helpResponse.requestId}]));
			}

			clearInterval(interval);
		});

		isGettingHelp = false;
		vscode.commands.executeCommand('setContext', '61a-bot.isGettingHelp', isGettingHelp);
		// if (Math.random() < 0.5) {
			const selection = await vscode.window.showInformationMessage(helpResponse.output, "Thanks, helpful!", "Not helpful...");
			submitFeedback(helpResponse.requestId, selection === "Thanks, helpful!" ? "1" : "-1");
		// } else {
			// const selection = await vscode.window.showInformationMessage(helpResponse.output, "OK"/*, SAY_MORE*/);
		// }
		// if (selection === SAY_MORE) {

		// }
	});

	context.subscriptions.push(getHelp);
}

// This method is called when your extension is deactivated
export function deactivate() {}