const JSDOM = require("jsdom").JSDOM;
const moment = require("moment");
const cloneDeep = require("lodash.clonedeep");
const axios = require("axios");
const querystring = require("querystring");

let JSESSIONID; // fak...

const init = async () => {
	handleCheckRequiredUserParameters();

	const username = String(process.env.sliciceNetUsername);
	const password = String(process.env.sliciceNetPassword);
	const albumId = String(process.env.sliciceNetAlbumId);
	const doSendPrivateMessages = Boolean(process.env.sliciceNetDoSendPrivateMessages === "true");

	const results = await scrapeAlbum(albumId);
	if (!results.has(username)) {
		console.error(`Data for username '${username}' was not found on Slicice.net. Ending program...`);
		process.exit(0);
	}
	const userData = results.get(username);
	results.delete(username);
	const trades = autoTrade({ results, userData });
	await sendMessages({ trades, username, password, doSendPrivateMessages });
};

const handleCheckRequiredUserParameters = () => {
	if (!process.env.sliciceNetUsername) {
		console.error("Provide username for Slicice.net. Ending program...");
		process.exit(0);
	}

	if (!process.env.sliciceNetPassword) {
		console.error("Provide password for Slicice.net. Ending program...");
		process.exit(0);
	}

	if (!process.env.sliciceNetAlbumId) {
		console.error("Provide albumId for Slicice.net. Ending program...");
		process.exit(0);
	}
};

const scrapeAlbum = async albumId => {
	const results = new Map();

	const pages = [await scrapeAlbumPage({ albumId, pageNumber: 0 })];
	const otherPagesNumbers = getValidPagesNumbers({ albumId, page: pages[0] });
	for (const num of otherPagesNumbers) {
		pages.push(await scrapeAlbumPage({ albumId, pageNumber: num }));
	}

	for (const page of pages) {
		const elements = page.window.document.querySelectorAll("div.offersBrowserRight.fix.right");
		for (const el of elements) {
			const head = el.querySelector("div.offersBrowserHead.fix");
			const body = el.querySelector("div.offersBrowserrEntry.fix");
			const answer = el.querySelector("div.answer");

			const username = head.querySelector("a.userName").textContent;
			const profilePageLink = `http://slicice.net${head.querySelector("a.userName").href}`;
			const messageLink = `http://slicice.net${answer.querySelector("a").href}`;
			const timestamp = moment(head.querySelector("span.offerDate").textContent, "DD-MM-YYYY").toDate();
			const missing = body
				.querySelector("p.missing")
				.textContent.replace(/iščem: /g, "")
				.replace(/\s/g, "")
				.split(",")
				.filter(el => el !== "")
				.map(el => padZeros(el));
			const duplicates = body
				.querySelector("p.duplicates")
				.textContent.replace(/ponujam: /g, "")
				.replace(/\s/g, "")
				.split(",")
				.filter(el => el !== "")
				.map(el => padZeros(el));

			const res = {
				username,
				profilePageLink,
				messageLink,
				timestamp,
				missing: new Set(missing),
				duplicates: new Set(duplicates),
			};

			results.set(res.username, res);
		}
	}

	return results;
};

const scrapeAlbumPage = async ({ albumId, pageNumber }) => {
	const url = `http://slicice.net/search/albums.html?go=true&id=${albumId}&position=${pageNumber}`;
	return scrapePage({ url });
};

const scrapeLoginPage = async ({ username, password }) => {
	const url = `http://slicice.net/sw4i/login`;
	return scrapePage({
		url,
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: JSESSIONID,
		},
		data: querystring.encode({ username, password }),
	});
};

const scrapePrivateMessagePage = async ({ receiver, subject = "MENJAVA SLICIC", body }) => {
	const url = `http://slicice.net/sw4i/newPrivateMessage`;
	return scrapePage({
		url,
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: JSESSIONID,
		},
		data: querystring.encode({
			receiver,
			subject,
			body,
		}),
	});
};

const scrapePage = async ({ url, method = "GET", headers, data }) => {
	console.log(`\nCalling: ${url}`);
	const res = await axios({
		url,
		method,
		headers,
		data,
	});
	if (!JSESSIONID && Array.isArray(res.headers["set-cookie"]) && res.headers["set-cookie"].length > 0) {
		JSESSIONID = res.headers["set-cookie"][0].split(";")[0];
	}
	return new JSDOM(res.data);
};

const getValidPagesNumbers = ({ albumId, page }) => {
	const numbers = new Set();
	const validLinks = page.window.document.querySelectorAll(
		`a[href^='/search/albums.html?go=true&id=${albumId}&position=']`,
	);
	for (const a of validLinks) {
		numbers.add(a.href.replace(`/search/albums.html?go=true&id=${albumId}&position=`, ""));
	}
	return [...numbers];
};

const autoTrade = ({ results, userData }) => {
	const trades = new Map();

	const resultsCopy = cloneDeep(results);
	let userDataCopy = cloneDeep(userData);

	while (true) {
		userDataCopy = cloneDeep(userDataCopy);
		const bestMatch = getBestMatch({ results: resultsCopy, userData: userDataCopy });
		if (!bestMatch) {
			break;
		}

		const username = bestMatch["username"];
		const matchedMyMissing = bestMatch["matchedMyMissing"];
		const matchedMyDuplicates = bestMatch["matchedMyDuplicates"];
		const matchScore = bestMatch["matchScore"];

		resultsCopy.delete(username);

		const toReceive = [...matchedMyMissing].slice(0, matchScore).map(card => {
			userDataCopy.missing.delete(card);
			return card;
		});
		const toGive = [...matchedMyDuplicates].slice(0, matchScore).map(card => {
			userDataCopy.duplicates.delete(card);
			return card;
		});

		const text = `
			<p>Zdravo!</p>
			<p>Bi menjal z mano slicice? Menjava lahko ${matchScore} slicic.</p>
			<p>Jaz imam zate:</p>
			<p>${toGive.join(", ")}</p>
			<p>Ti imas zame:</p>
			<p>${toReceive.join(", ")}</p>
			<p>Sporoci ce si za oziroma ce se imas/rabis navedene slicice. Imas lepo ohranjene slicice? Moj postni naslov je:</p>
			<p>xxx</p>
			<p>LP</p>
		`;

		console.log(`\nTRADING WITH USER '${username}'`);
		console.log(`${matchScore} CARDS TO GIVE     :  ${toGive.join(", ")}`);
		console.log(`${matchScore} CARDS TO RECEIVE  :  ${toReceive.join(", ")}`);
		console.log(
			`After this trade you are now missing ${padZeros(userDataCopy.missing.size)} cards and have ${padZeros(
				userDataCopy.duplicates.size,
			)} unique cards available for trade.`,
		);

		trades.set(username, text);
	}

	return trades;
};

const getBestMatch = ({ results, userData }) => {
	let bestMatch = null;

	for (const result of results.values()) {
		result.matchedMyMissing = new Set();
		for (const card of result.duplicates) {
			if (userData.missing.has(card)) {
				result.matchedMyMissing.add(card);
			}
		}

		result.matchedMyDuplicates = new Set();
		for (const card of result.missing) {
			if (userData.duplicates.has(card)) {
				result.matchedMyDuplicates.add(card);
			}
		}

		result.matchScore = Math.min(result.matchedMyMissing.size, result.matchedMyDuplicates.size);

		if (result.matchScore > 0 && (!bestMatch || bestMatch["matchScore"] < result.matchScore)) {
			bestMatch = result;
		}
	}

	return bestMatch;
};

const sendMessages = async ({ trades, username, password, doSendPrivateMessages }) => {
	const loginPage = await scrapeLoginPage({ username, password });

	const loginCheck = loginPage.window.document.querySelector(
		"#header > div.userNav > ul > li:nth-child(1) > a > span",
	);
	if (!(loginCheck && loginCheck.textContent === username)) {
		console.error(
			"Script did not login correctly to your account on Slicice.net. Cannot send private messages. Ending program...",
		);
		process.exit(0);
	}

	for (const [receiver, body] of trades) {
		if (doSendPrivateMessages) {
			await scrapePrivateMessagePage({ receiver, body });
		}
		console.log(body);
	}
};

const padZeros = number => {
	let temp = `${number}`;
	while (temp.length < 3) {
		temp = `0${temp}`;
	}
	return temp;
};

init().catch(ex => console.error(ex));
