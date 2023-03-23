import { MarkdownView, Notice, Plugin, TFile } from "obsidian";

import { DEFAULT_SETTINGS, SettingsProp } from "./types/index";
import { SettingTab } from "./settingTab";
import { publishPost } from "./methods/publishPost";
export default class GhostPublish extends Plugin {
	settings: SettingsProp;

	async onload() {
		// load the settings first
		await this.loadSettings();

		// 2 ways to publish:
		// 1. Click on the ghost icon on the left
		this.addRibbonIcon("ghost", "Publish Ghost", () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice(
					"Open the markdown file first before publish your post"
				);
				return;
			}

			publishPost(view, this.settings);
		});

		// 2. Run the by command + P
		this.addCommand({
			id: "publish",
			name: "Publish current document",
			editorCallback: (_, view: MarkdownView) => {
				if (!view) {
					new Notice(
						"Open the markdown file first before publish your post"
					);
					return;
				}

				publishPost(view, this.settings);
			},
		});

		this.addCommand({
			id: "move-image-under-cursor",
			name: "Move image under cursor",
			editorCallback: async (editor, view: MarkdownView) => {
				if (!view) {
					new Notice("No active view");
					return;
				}

				const cursorPos = editor.getCursor();
				const lineText = editor.getLine(cursorPos.line);
				const match = /!\[\[(.+)\]\]/.exec(lineText);

				if (!match || !match[1]) {
					console.error(
						"No valid file link found at cursor position"
					);
					return;
				}

				const fileName = match[1];

				try {
					// Get abstract representation of source file based on its path
					const sourceFilePath = `Private/Screenshots/${fileName}`;
					const sourceFile: TFile | null =
						(await this.app.vault.getAbstractFileByPath(
							sourceFilePath
						)) as TFile;

					if (!sourceFile) {
						console.error(`Could not find file ${fileName}`);
						return;
					}

					// Move/rename the file by changing its parent folder
					const newParentFolderName = "Attachments";

					this.app.fileManager.renameFile(
						sourceFile,
						`${newParentFolderName}/${sourceFile.name}`
					);

					console.log(
						`Successfully moved/renamed ${fileName} to ${newParentFolderName}/${sourceFile.name}`
					);
				} catch (error) {
					console.error(error);
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
