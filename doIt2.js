const rp = require("request-promise");
const JSDOM = require("jsdom").JSDOM;
const moment = require("moment");
const cloneDeep = require("lodash.clonedeep");

const init = async () => {
	if (!process.env.sliciceNetUsername) {
		console.error("Provide username for Slicice.net. Ending program...");
		process.exit(0);
	}

	if (!process.env.sliciceNetAlbumId) {
		console.error("Provide albumId for Slicice.net. Ending program...");
		process.exit(0);
	}

	const username = process.env.sliciceNetUsername;
	const albumId = process.env.sliciceNetAlbumId;

	const results = new Map();
	await scrape({ results, albumId });
	if (!results.has(username)) {
		console.error(`Data for username '${username}' was not found on Slicice.net. Ending program...`);
	}
	const userData = results.get(username);
	results.delete(username);
	autoTrade({ results, userData });
	console.log("There are no more suitable cards to trade. Ending program...");
};

const scrape = async ({ results, albumId, pagesCount = 0 }) => {
	let response;
	try {
		const url = `http://slicice.net/search/albums.html?go=true&id=${albumId}&position=${pagesCount}`;
		console.log(`Calling: ${url}`);
		response = new JSDOM(await rp(url));
	} catch {
		return;
	}
	const elements = response.window.document.querySelectorAll("div.offersBrowserRight.fix.right");
	for (const el of elements) {
		const head = el.querySelector("div.offersBrowserHead.fix");
		const body = el.querySelector("div.offersBrowserrEntry.fix");
		const missing = body
			.querySelector("p.missing")
			.textContent.replace(/iščem: /g, "")
			.replace(/\s/g, "");
		const duplicates = body
			.querySelector("p.duplicates")
			.textContent.replace(/ponujam: /g, "")
			.replace(/\s/g, "");

		const res = {
			username: head.querySelector("a.userName").textContent,
			timestamp: moment(head.querySelector("span.offerDate").textContent, "DD-MM-YYYY").toDate(),
			missing: new Set(
				missing
					.split(",")
					.filter(el => el !== "")
					.map(el => padZeros(el)),
			),
			duplicates: new Set(
				duplicates
					.split(",")
					.filter(el => el !== "")
					.map(el => padZeros(el)),
			),
		};

		results.set(res.username, res);
	}
	if (elements.length > 0) {
		await scrape({ results, albumId, pagesCount: ++pagesCount });
	}
};

const autoTrade = ({ results, userData }) => {
	const userDataCopy = cloneDeep(userData);

	const bestMatch = getBestMatch({ results, userData });
	if (!bestMatch) {
		return;
	}
	results.delete(bestMatch.username);

	const toReceive = [...bestMatch.matchedMyMissing].slice(0, bestMatch.matchScore).map(card => {
		userDataCopy.missing.delete(card);
		return card;
	});
	const toGive = [...bestMatch.matchedMyDuplicates].slice(0, bestMatch.matchScore).map(card => {
		userDataCopy.duplicates.delete(card);
		return card;
	});

	console.log(`\nTRADING WITH USER '${bestMatch.username}'`);
	console.log(`${bestMatch.matchScore} CARDS TO GIVE     :  ${toGive.join(", ")}`);
	console.log(`${bestMatch.matchScore} CARDS TO RECEIVE  :  ${toReceive.join(", ")}`);
	console.log(
		`After this trade you are now missing ${padZeros(userDataCopy.missing.size)} cards and have ${padZeros(
			userDataCopy.duplicates.size,
		)} unique cards available for trade.`,
	);

	autoTrade({ results, userData: userDataCopy });
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

		if (result.matchScore > 0 && (!bestMatch || bestMatch.matchScore < result.matchScore)) {
			bestMatch = result;
		}
	}

	return bestMatch;
};

const padZeros = number => {
	let temp = `${number}`;
	while (temp.length < 3) {
		temp = `0${temp}`;
	}
	return temp;
};

init().catch(ex => console.error(ex));
