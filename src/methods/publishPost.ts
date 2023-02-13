/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, ContentProp, DataProp } from "./../types/index";
import { MarkdownView, Notice, request } from "obsidian";
import { sign } from "jsonwebtoken";

const md_footnote = require("markdown-it-footnote");
const matter = require("gray-matter");
const MarkdownIt = require("markdown-it");

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

const replaceFootnotesWithHTMLCard = (content: string) => {
	// Ghost swallows the footnote links for some reason, so we need to replace them with a HTML card
	/*
	<hr class="footnotes-sep">
	<section class="footnotes">
	<ol class="footnotes-list">
	<li id="fn1" class="footnote-item"><p>test <a href="#fnref1" class="footnote-backref">↩︎</a></p>
	</li>
	<li id="fn2" class="footnote-item"><p>test2 <a href="#fnref2" class="footnote-backref">↩︎</a></p>
	</li>
	</ol>
	</section>

	needs to be surrounded with `<!--kg-card-begin: html-->` and `<!--kg-card-end: html-->`
	*/



	const footnotes = content.match(
		/<hr class="footnotes-sep">(.*)<\/section>/s
	);
	if (footnotes) {
		const htmlCard = `<!--kg-card-begin: html--><div class="kg-card-markdown">${footnotes[0]}</div><!--kg-card-end: html-->`;
		content = content.replace(
			/<hr class="footnotes-sep">(.*)<\/section>/s,
			htmlCard
		);

		// remove the footnote links
		content = content.replace(/<a href="#fnref.*<\/a>/g, "");
	}

	return content;
};

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
		imagesYear: metaMatter["ghost-images-year"] || undefined,
		imagesMonth: metaMatter["ghost-images-month"] || undefined,
	};

	const BASE_URL = settings.baseURL;

	// convert [[link]] to <a href="BASE_URL/id" class="link-previews">Internal Micro</a>for Ghost
	const content = data.content.replace(
		/!*\[\[(.*?)\]\]/g,
		(match: any, p1: string) => {
			if (
				p1.toLowerCase().includes(".png") ||
				p1.toLowerCase().includes(".jpg") ||
				p1.toLowerCase().includes(".jpeg") ||
				p1.toLowerCase().includes(".gif")
			) {
				try {
					let year;
					let month;
					if (frontmatter.imagesYear && frontmatter.imagesMonth) {
						year = frontmatter.imagesYear;
						month = frontmatter.imagesMonth;

						if (month < 10) {
							month = `0${month}`;
						}

						console.log("year", year);
						console.log("month", month);
					} else {
						// get the year
						year = new Date().getFullYear();
						// get the month
						const monthNum = new Date().getMonth() + 1;
						month = monthNum.toString();
						if (monthNum < 10) {
							month = `0${monthNum}`;
						}
					}

					return `<figure class="kg-card kg-image-card"><img src="${BASE_URL}/content/images/${year}/${month}/${p1
						.replace(/ /g, "-")
						.replace(
							/%20/g,
							"-"
						)}" alt="${BASE_URL}/content/images/${year}/${month}/${p1
						.replace(/ /g, "-")
						.replace(
							/%20/g,
							"-"
						)}"></img><figcaption>${p1}</figcaption></figure>`;
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

	// convert youtube embeds to ghost embeds
	data.content = data.content.replace(
		/<iframe.*src="https:\/\/www.youtube.com\/embed\/(.*?)".*<\/iframe>/g,
		(match: any, p1: string) => {
			return `<figure class="kg-card kg-embed-card"><div class="kg-embed-card"><iframe width="560" height="315" src="https://www.youtube.com/embed/${p1}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></figure>`;
		}
	);

	// take the url from view tweet format and replace the entire blockquote with a tweet embed iframe
	// add a new line before every ([View Tweet]
	data.content = data.content.replace(
		/\(\[View Tweet\]/gm,
		"\n([View Tweet]"
	);

	data.content = data.content.replace(
		/(^>.*\n.*)*\(https:\/\/twitter.com\/(.*)\/status\/(\d+)\)\)/gm,
		(match: any, p1: string, p2: string, p3: string) => {
			console.log("p1", p1);
			console.log("p2", p2);

			const url = `https://twitter.com/${p2}/status/${p3}?ref_src=twsrc%5Etfw`;
			return `<figure class="kg-card kg-embed-card"><div class="twitter-tweet twitter-tweet-rendered"><iframe src="${url}" width="550" height="550" frameborder="0" scrolling="no" allowfullscreen="true" style="border: none; max-width: 100%; min-width: 100%;"></iframe></div></figure>`;
		}
	);

	const sendToGhost = true; // set to false to test locally

	if (sendToGhost) {
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
			frontmatter.updated_at =
				JSON.parse(slugExistsRes).posts[0].updated_at;

			const htmlContent = contentPost(frontmatter, data);
			htmlContent.posts[0].html = replaceFootnotesWithHTMLCard(
				htmlContent.posts[0].html
			);
			console.log("htmlContent", htmlContent);
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
				body: JSON.stringify(htmlContent),
			});

			// console.log(contentPost(frontmatter, data));

			const json = JSON.parse(result);

			if (json?.posts) {
				new Notice(
					`"${json?.posts?.[0]?.title}" update has been ${json?.posts?.[0]?.status} successful!`
				);
				// https://bram-adams.ghost.io/ghost/#/editor/post/63d3246b7932ae003df67c64
				openInBrowser(
					`${settings.url}/ghost/#/editor/post/${json?.posts?.[0]?.id}`
				);
			} else {
				console.log(
					`${json.errors[0]?.details[0].message} - ${json.errors[0]?.details[0].params.allowedValues}`
				);
				console.log(
					`${json.errors[0].context || json.errors[0].message}`
				);
			}
		} else {
			const htmlContent = contentPost(frontmatter, data);
			htmlContent.posts[0].html = replaceFootnotesWithHTMLCard(
				htmlContent.posts[0].html
			);
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
				body: JSON.stringify(htmlContent),
			});

			const json = JSON.parse(result);

			if (json?.posts) {
				new Notice(
					`"${json?.posts?.[0]?.title}" has been ${json?.posts?.[0]?.status} successful!`
				);
				openInBrowser(
					`${settings.url}/ghost/#/editor/post/${json?.posts?.[0]?.id}`
				);
			} else {
				new Notice(
					`${json.errors[0].context || json.errors[0].message}`
				);
				new Notice(
					`${json.errors[0]?.details[0].message} - ${json.errors[0]?.details[0].params.allowedValues}`
				);
			}

			return json;
		}
	}
};
