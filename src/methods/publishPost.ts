/* eslint-disable @typescript-eslint/no-var-requires */
import { SettingsProp, ContentProp, DataProp } from "./../types/index";
import { MarkdownView, Notice, request } from "obsidian";
import { sign } from "jsonwebtoken";
import { parse } from 'node-html-parser'; 

const md_footnote = require("markdown-it-footnote");
const matter = require("gray-matter");
const MarkdownIt = require("markdown-it");

const sendToGhost = true; // set to false to test locally

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

const replaceListsWithHTMLCard = (content: string) => {
	// Ghost swallows the list for some reason, so we need to replace them with a HTML card

	let parsedContent = parse(content);
	// add font family var(--font-serif) to lists > li and replace content
	const li = parsedContent.querySelectorAll('li').filter(li => {
		return li.attributes.class !== 'footnotes-list';
	});
	li.forEach(li => {
		li.setAttribute('style', 'font-family: var(--font-serif)');
	});

	content = parsedContent.toString();
	parsedContent = parse(content); // i couldnt think of a better way to do this lmao

	const lists = parsedContent.querySelectorAll('ul, ol').filter(list => {
		return list.parentNode.tagName === null && list.attributes.class !== 'footnotes-list';
	});

	// wrap list in HTML card const htmlCard = `<!--kg-card-begin: html--><div class="kg-card-markdown">${list[0]}</div><!--kg-card-end: html-->`;
	lists.forEach(list => {

		
		const htmlCard = `<!--kg-card-begin: html--><div>${list.outerHTML}</div><!--kg-card-end: html-->`;
		content = content.replace(list.outerHTML, htmlCard);
	});

	
	
	return content;
};

// run all replacers on the content
const replacer = (content: string) => {
	content = replaceListsWithHTMLCard(content);
	content = replaceFootnotesWithHTMLCard(content);
	// const replaceYellowCallout = (content: string) => {
	// 	// replace kg-callout-card-#F1F3F4 with kg-callout-card-yellow
	// 	content = content.replace(
	// 		/kg-callout-card-#F1F3F4/g,
	// 		"kg-callout-card-yellow"
	// 	);
	// 	return content;
	// }
	// content = replaceYellowCallout(content);
	console.log(content);
	return content;
};



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
		/<hr class="footnotes-sep">([\s\S]*)<\/section>/
	);
	if (footnotes) {
		const htmlCard = `<!--kg-card-begin: html--><div class="kg-card-markdown">${footnotes[0]}</div><!--kg-card-end: html-->`;
		content = content.replace(
			/<hr class="footnotes-sep">([\s\S]*)<\/section>/,
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
		custom_excerpt: metaMatter?.excerpt || undefined,
		feature_image: metaMatter?.feature_image || undefined,
		updated_at: metaMatter?.updated_at || undefined,
		"date modified": metaMatter["date modified"] || undefined,
		imagesYear: metaMatter["ghost-images-year"] || undefined,
		imagesMonth: metaMatter["ghost-images-month"] || undefined,
	};

	const BASE_URL = settings.baseURL;

	if (frontmatter.custom_excerpt && frontmatter.custom_excerpt.length > 300) {
		new Notice("Excerpt is too long. Max 300 characters.");
		return;
	}

	const wikiLinkReplacer = (match: any, p1: string) => {
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
					)}" class="kg-image" alt="${p1}" loading="lazy"></figure>`;
			} catch (err) {
				console.log("is404Req", err);
			}
		} else if (
			p1.toLowerCase().includes(".m4a") ||
			p1.toLowerCase().includes(".mp3") ||
			p1.toLowerCase().includes(".wav")
		) {
			let year;
			let month;
			if (frontmatter.imagesYear && frontmatter.imagesMonth) {
				year = frontmatter.imagesYear;
				month = frontmatter.imagesMonth;

				if (month < 10) {
					month = `0${month}`;
				}
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

			return `<div class="kg-card kg-audio-card">
			<div class="kg-audio-player-container"><audio src="${BASE_URL}/content/media/${year}/${month}/${p1
				.replace(/ /g, "-")
				.replace(
					/%20/g,
					"-"
				)}" preload="metadata"></audio><div class="kg-audio-title">${p1
				.replace(".m4a", "")
				.replace(".wav", "")
				.replace(
					".mp3",
					""
				)}</div></div></div>`;
		}

		const [link, text] = p1.split("|");
		const [id, slug] = link.split("#");

		// Get frontmatter of the linked note
		const linkedNote = app.metadataCache.getFirstLinkpathDest(id, noteFile.path);
		const linkedNoteMeta = app.metadataCache.getFileCache(linkedNote)?.frontmatter;

		// Get slug from frontmatter
		const linkedNoteSlug = linkedNoteMeta?.slug;

		const url = `${BASE_URL}/${linkedNoteSlug || slug || id}`;
		const linkText = text || id || slug;
		const linkHTML = `<a href="${url}">${linkText}</a>`;
		return linkHTML;
	}

	// convert [[link]] to <a href="BASE_URL/id" class="link-previews">Internal Micro</a>for Ghost
	const content = data.content.replace(
		/!*\[\[(.*?)\]\]/g,
		wikiLinkReplacer
	);


	data.content = content;

	// console.log("data.content", data.content);

	// remove the first h1 (# -> \n) in the content
	// 修正為只移除單一 # 開頭的標題
	data.content = data.content.replace(/^# .*(\n|$)/, "");

	// 處理外部圖片嵌入 ![](https://xxx.com)
	data.content = data.content.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		(match: any, alt: string, url: string) => {
			// 檢查是否為圖片格式
			if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) {
				return `<figure class="kg-card kg-image-card"><img src="${url}" class="kg-image" alt="${alt || ''}" loading="lazy"></figure>`;
			}
			// 檢查是否為影片格式
			else if (url.match(/\.(mov|mp4|avi|wmv|flv|webm|mkv|m4v|3gp|ogv)$/i)) {
				return `<figure class="kg-card kg-image-card"><img src="${url}" class="kg-image" alt="${alt || ''}" loading="lazy"></figure>`;
			}
			// 檢查是否為 YouTube 連結
			else if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
				const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
				if (videoId) {
					return `<figure class="kg-card kg-embed-card"><iframe width="200" height="113" src="https://www.youtube.com/embed/${videoId}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen="" title="YouTube video"></iframe></figure>`;
				}
			}
			// 其他格式保持原樣
			return match;
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

	// replace ==highlight== with highlight span
	data.content = data.content.replace(
		/==([\S\s]*?)==/g,
		(match: any, p1: string) => {
			return `<b>${p1}</b>`;
		}
	);

	console.log("data.content", data.content);


	// replace ```ad-summary ...``` with callout block
	data.content = data.content.replace(
		/```ad-summary([\S\s]*?)```/g,
		(match: any, p1: string) => {
			return `<div class="kg-card kg-callout-card kg-callout-card-gray"><div class="kg-callout-emoji">TL;DR</div><div class="kg-callout-text">${p1}</div></div>`;
		}
	);

	// replace =begin-chatgpt-md-comment to =end-chatgpt-md-comment with callout block
	data.content = data.content.replace(
		/=begin-chatgpt-md-comment([\S\s]*?)=end-chatgpt-md-comment/g,
		(match: any, p1: string) => {
			const p1HrefLink = p1.replace(
				/(\[.*?\])(\(.*?\))/g,
				(match: any, p1: string, p2: string) => {
					return `<a href="${p2.replace(
						/[\(\)]/g,
						""
					)}">${p1.slice(1,-1)}</a>`;
				}
			);

			const p1WikiLink = p1HrefLink.replace(
				/!*\[\[(.*?)\]\]/g,
				wikiLinkReplacer
			);

			return `<div class="kg-card kg-callout-card-yellow kg-callout-card"><div class="kg-callout-card-yellow"><div class="kg-callout-emoji">💡</div><div class="kg-callout-text">${p1WikiLink}</div></div></div>`; // color does not work ghost ruins it for some reason
		}
	);
	
	// fucking fail
	// replace ```bookmark ...``` with callout block
	// data.content = data.content.replace(
	// 	/```bookmark([\S\s]*?)```/g,
	// 	(match: any, p1: string) => {
	// 		console.log("p1", p1);
	// 		return `<figure class="kg-card kg-embed-card"><a href="${p1}">${p1}</a></div></figure>`;
	// 	}
	// );

	const htmlContent = contentPost(frontmatter, data);
			htmlContent.posts[0].html = replacer(htmlContent.posts[0].html);

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
			htmlContent.posts[0].html = replacer(htmlContent.posts[0].html);
			
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
			htmlContent.posts[0].html = replacer(htmlContent.posts[0].html);
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
