/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, ContentProp, DataProp } from "./../types/index";
import {
	MarkdownView,
	Notice,
	request,
	TFile,
	getLinkpath,
	parseLinktext,
	requestUrl,
	RequestUrlParam
} from "obsidian";
import { sign } from "jsonwebtoken";
import { readFileSync } from "fs";

const matter = require("gray-matter");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt({
	html: true,
});
const version = "v4";

const contentPost = (frontmatter: ContentProp, data: DataProp) => ({
	posts: [
		{
			...frontmatter,
			html: md.render(data.content),
		},
	],
});

export const publishPost = async (
	view: MarkdownView,
	settings: SettingsProp
) => {
	// Ghost Url and Admin API key
	const key = settings.adminToken;
	const [id, secret] = key.split(":");

	// Create the token (including decoding secret)
	const token = sign({}, Buffer.from(secret, "hex"), {
		keyid: id,
		algorithm: "HS256",
		expiresIn: "5m",
		audience: `/${version}/admin/`,
	});

	// get frontmatter
	const noteFile = app.workspace.getActiveFile();
	const metaMatter = app.metadataCache.getFileCache(noteFile).frontmatter;
	const data = matter(view.getViewData());

	const frontmatter = {
		title: metaMatter?.title || view.file.basename,
		tags: metaMatter?.tags || [],
		featured: metaMatter?.featured || false,
		slug: metaMatter?.slug || view.file.basename,
		status: metaMatter?.published ? "published" : "draft",
		excerpt: metaMatter?.excerpt || undefined,
		feature_image: metaMatter?.feature_image || undefined,
	};

	const BASE_URL = settings.baseURL;

	// convert [[link]] to <a href="BASE_URL/id" class="link-previews">Internal Micro</a>for Ghost
	const content = data.content.replace(
		/\[\[(.*?)\]\]/g,
		(match: any, p1: string) => {
			if (p1.includes(".png")) {
				return `![${p1}](${BASE_URL}/${p1})`;
			}

			const [link, text] = p1.split("|");
			const [id, slug] = link.split("#");
			const url = `${BASE_URL}/${id}`;
			const linkText = text || slug || link;
			const linkHTML = `<a href="${url}">${linkText}</a>`;
			return linkHTML;
		}
	);
	data.content = content;

	// remove the first h1
	// const contentWithoutH1 = data.content.replace(/^#.*$/gm, "");
	// data.content = contentWithoutH1;

	console.log(contentPost(frontmatter, data));

	// use the ghosts admin /post api to see if post with slug exists
	// const result = await request({
	// 	url: `${settings.url}/ghost/api/${version}/admin/posts/?source=html&filter=slug:${frontmatter.slug}`,
	// 	method: "GET",
	// 	contentType: "application/json",
	// 	headers: {
	// 		"Access-Control-Allow-Methods": "GET",
	// 		"Content-Type": "application/json;charset=utf-8",
	// 		Authorization: `Ghost ${token}`,
	// 	},
	// });

	// const json = JSON.parse(result);
	// console.log(json)

	// fetch image from path
	const path = "ultra.png";
	// read file from path using fs
	const image = readFileSync(path);

	// create blob from image
	const blob = new Blob([image], { type: "image/png" });

	const file = new File([blob], "ultra.png", { type: "image/png" });
	console.log(file);

	// log links in CachedMetadata
	// const links = app.metadataCache.getFileCache(noteFile).embeds
	// console.log(links)

	// use getFirstLinkpathDest to get the path of the link
	const shortpath =
		"last of us smart one 1 Screenshot 2023-01-15 23-28-54.png";
	const link = app.metadataCache.getFirstLinkpathDest(
		shortpath,
		noteFile.path
	);
	console.log(link); // <- this works

	// const blob = await image.blob();
	// const file = new File([blob], "ultra.png", { type: "image/png" });

	// upload image to ghost
	const formData = new FormData();
	formData.append("file", file);
	formData.append("ref", "ultra.png");
	formData.append("purpose", "image");

	

	// https://stackoverflow.com/questions/74276173/how-to-send-multipart-form-data-payload-with-typescript-obsidian-library
	const N = 16; // The length of our random boundry string
	const randomBoundryString =
		"djmangoBoundry" +
		Array(N + 1)
			.join(
				(Math.random().toString(36) + "00000000000000000").slice(2, 18)
			)
			.slice(0, N);

	// Construct the form data payload as a string
	const pre_string = `------${randomBoundryString}\r\nContent-Disposition: form-data; name="image_file"; filename="blob"\r\nContent-Type: "application/octet-stream"\r\n\r\n`;
	const post_string = `\r\n------${randomBoundryString}--`;

	// Convert the form data payload to a blob by concatenating the pre_string, the file data, and the post_string, and then return the blob as an array buffer
	const pre_string_encoded = new TextEncoder().encode(pre_string);
	const datab = new Blob([
		await app.vault.adapter.readBinary("Attachments/ultra.png"),
	]);
	const post_string_encoded = new TextEncoder().encode(post_string);
	const concatenated = await new Blob([
		pre_string_encoded,
		await datab.arrayBuffer(),
		post_string_encoded,
	]).arrayBuffer();


	// Now that we have the form data payload as an array buffer, we can pass it to requestURL
	// We also need to set the content type to multipart/form-data and pass in the boundry string
	const options: RequestUrlParam = {
		method: "POST",
		url: `${settings.url}/ghost/api/admin/images/upload/`,
		contentType: `multipart/form-data; boundary=----${randomBoundryString}`,
		body: concatenated,
		headers: {
			"Content-Type": "multipart/form-data",
			Authorization: `Ghost ${token}`,
			"Accept-Version": `${version}`,
		},
	};

	console.log(token)

	requestUrl(options)
		.then((response) => {
			console.log(response);
		})
		.catch((error) => {
			console.log("something went wrong")
			console.error(error.message);
		});

	// upload an image from a file path in obsidian to the ghost content api
	// example curl curl -X POST -F 'file=@/path/to/images/my-image.jpg' -F 'ref=path/to/images/my-image.jpg' -H "Authorization: 'Ghost $token'" -H "Accept-Version: $version" https://{admin_domain}/ghost/api/admin/images/upload/

	// const result = await request({
	// 	url: `${settings.url}/ghost/api/${version}/admin/images/upload/`,
	// 	method: "POST",
	// 	contentType: "multipart/form-data",
	// 	headers: {
	// 		"Access-Control-Allow-Methods": "POST",
	// 		"Content-Type": "multipart/form-data",
	// 		Authorization: `Ghost ${token}`,
	// 	},
	// 	body: JSON.stringify(contentPost(frontmatter, data)),
	// });

	// const result = await request({
	// 	url: `${settings.url}/ghost/api/${version}/admin/posts/?source=html`,
	// 	method: "POST",
	// 	contentType: "application/json",
	// 	headers: {
	// 		"Access-Control-Allow-Methods": "POST",
	// 		"Content-Type": "application/json;charset=utf-8",
	// 		Authorization: `Ghost ${token}`,
	// 	},
	// 	body: JSON.stringify(contentPost(frontmatter, data)),
	// });

	// const json = JSON.parse(result);

	// if (json?.posts) {
	// 	new Notice(
	// 		`"${json?.posts?.[0]?.title}" has been ${json?.posts?.[0]?.status} successful!`
	// 	);
	// } else {
	// 	new Notice(`${json.errors[0].context || json.errors[0].message}`);
	// 	new Notice(
	// 		`${json.errors[0]?.details[0].message} - ${json.errors[0]?.details[0].params.allowedValues}`
	// 	);
	// }

	// return json;
};
