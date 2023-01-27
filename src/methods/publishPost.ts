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

const md_footnote = require("markdown-it-footnote");
const matter = require("gray-matter");
const MarkdownIt = require("markdown-it")


const md = new MarkdownIt({
	html: true,
}).use(md_footnote);
const version = "v4";

const contentPost = (frontmatter: ContentProp, data: DataProp) => ({
	posts: [
		{
			...frontmatter,
			html: md.render(data.content),
		},
	],
});

const openInBrowser = (url: string) => {
	const a = document.createElement("a");
	a.href = url;
	a.target = "_blank";
	a.rel = "noopener noreferrer";
	a.click();
};

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
		updated_at: metaMatter?.updated_at || undefined,
		"date modified": metaMatter["date modified"] || undefined,
	};

	const BASE_URL = settings.baseURL;

	// convert [[link]] to <a href="BASE_URL/id" class="link-previews">Internal Micro</a>for Ghost
	const content = data.content.replace(
		/!*\[\[(.*?)\]\]/g,
		(match: any, p1: string) => {
			if (p1.toLowerCase().includes(".png") || p1.toLowerCase().includes(".jpg") || p1.toLowerCase().includes(".jpeg") || p1.toLowerCase().includes(".gif")) {
				try {
					console.log("match ", p1);
					// get the year
					const year = new Date().getFullYear();
					// get the month
					const monthNum = new Date().getMonth() + 1;
					let month = monthNum.toString();
					if (monthNum < 10) {
						month = `0${monthNum}`;
					}

					return `<figure class="kg-card kg-image-card"><img src="${BASE_URL}/content/images/${year}/${month}/${p1.replace(/ /g, "-").replace(/%20/g, "-")}" alt="${BASE_URL}/content/images/${year}/${month}/${p1.replace(/ /g, "-").replace(/%20/g, "-")}"></img><figcaption>${p1}</figcaption></figure>`;
				} catch (err) {
					console.log("is404Req", err);
				}
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

	// remove the first h1 (# -> \n) in the content
	data.content = data.content.replace(/#.*\n/, "");

	/* example of youtube embed
<iframe width="560" height="315" src="https://www.youtube.com/embed/FQ5YU_spBw0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
	*/

	// convert youtube embeds to ghost embeds
	data.content = data.content.replace(
		/<iframe.*src="https:\/\/www.youtube.com\/embed\/(.*?)".*<\/iframe>/g,
		(match: any, p1: string) => {
			return `<figure class="kg-card kg-embed-card"><div class="kg-embed-card"><iframe width="560" height="315" src="https://www.youtube.com/embed/${p1}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></figure>`;
		}
	);

	// use the ghosts admin /post api to see if post with slug exists
	const slugExistsRes = await request({
		url: `${settings.url}/ghost/api/${version}/admin/posts/?source=html&filter=slug:${frontmatter.slug}`,
		method: "GET",
		contentType: "application/json",
		headers: {
			"Access-Control-Allow-Methods": "GET",
			"Content-Type": "application/json;charset=utf-8",
			Authorization: `Ghost ${token}`,
		},
	});

	const slugExists = JSON.parse(slugExistsRes).posts.length > 0;

	if (slugExists) {
		// get id of post if it exists
		const id = JSON.parse(slugExistsRes).posts[0].id;
		console.log("slug exists -- updating post:" + id);

		// add updated_at iso string to frontmatter
		frontmatter.updated_at = JSON.parse(slugExistsRes).posts[0].updated_at;
		
		console.log(contentPost(frontmatter, data));



		// if slug exists, update the post
		const result = await request({
			url: `${settings.url}/ghost/api/${version}/admin/posts/${id}/?source=html`,
			method: "PUT",
			contentType: "application/json",
			headers: {
				"Access-Control-Allow-Methods": "PUT",
				"Content-Type": "application/json;charset=utf-8",
				Authorization: `Ghost ${token}`,
			},
			body: JSON.stringify(contentPost(frontmatter, data)),
		});

		console.log(result)

		const json = JSON.parse(result);

		if (json?.posts) {
			new Notice(
				`"${json?.posts?.[0]?.title}" update has been ${json?.posts?.[0]?.status} successful!`
			);
			// https://bram-adams.ghost.io/ghost/#/editor/post/63d3246b7932ae003df67c64
			openInBrowser(`${settings.url}/ghost/#/editor/post/${json?.posts?.[0]?.id}`);
		} else {
			console.log(`${json.errors[0]?.details[0].message} - ${json.errors[0]?.details[0].params.allowedValues}`)
			console.log(`${json.errors[0].context || json.errors[0].message}`)
		}

	} else {
		// upload post
		const result = await request({
			url: `${settings.url}/ghost/api/${version}/admin/posts/?source=html`,
			method: "POST",
			contentType: "application/json",
			headers: {
				"Access-Control-Allow-Methods": "POST",
				"Content-Type": "application/json;charset=utf-8",
				Authorization: `Ghost ${token}`,
			},
			body: JSON.stringify(contentPost(frontmatter, data)),
		});

		const json = JSON.parse(result);

		if (json?.posts) {
			new Notice(
				`"${json?.posts?.[0]?.title}" has been ${json?.posts?.[0]?.status} successful!`
			);
			openInBrowser(`${settings.url}/ghost/#/editor/post/${json?.posts?.[0]?.id}`);
		} else {
			new Notice(`${json.errors[0].context || json.errors[0].message}`);
			new Notice(
				`${json.errors[0]?.details[0].message} - ${json.errors[0]?.details[0].params.allowedValues}`
			);
		}

		return json;
	}
};
