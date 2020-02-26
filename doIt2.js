const rp = require("request-promise");
const JSDOM = require("jsdom").JSDOM;
const moment = require("moment");
const cloneDeep = require("lodash.clonedeep");

const username = process.env.username || "marvin";
const albumId = process.env.albumId || 61;

const init = async () => {
	const results = new Map();
	await scrape({ results, albumId });
	if (!results.has("marvin")) throw new Error("Your data was not found on Slicice.net");
	const userData = results.get(username);
	const _results = [];
	for (const result of results.values()) {
		// skip yourself
		if (result === userData) continue;
		_results.push(result);
	}
	autoTrade({ results: _results, userData });
	console.log("There are no more suitable trading cards. Ending program");
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

const getSortedResults = ({ results, userData }) => {
	return results
		.map(result => {

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
			return result;
		})
		.filter(result => result.matchScore)
		.sort((a, b) => b.matchScore - a.matchScore);
};

const padZeros = number => {
	let temp = `${number}`;
	while (temp.length < 3) {
		temp = `0${temp}`;
	}
	return temp;
};

const autoTrade = ({ results, userData }) => {
	const sortedResults = getSortedResults({ results, userData });

	const sortedResultsCopy = cloneDeep(sortedResults);
	const userDataCopy = cloneDeep(userData);

	const bestMatch = sortedResultsCopy[0];
	if (!bestMatch) {
		console.error("No best match");
		return;
	}

	if (bestMatch.matchScore < 1) {
		console.error("No one has nothing else to offer you");
		return;
	}

	const toReceive = [...bestMatch.matchedMyMissing].slice(0, bestMatch.matchScore).map(card => {
		userDataCopy.missing.delete(card);
		return card;
	});
	const toGive = [...bestMatch.matchedMyDuplicates].slice(0, bestMatch.matchScore).map(card => {
		userDataCopy.duplicates.delete(card);
		return card;
	});
	sortedResultsCopy.shift();

	console.log(`TRADING WITH USER '${bestMatch.username}'`);
	console.log(`${bestMatch.matchScore} CARDS TO GIVE     :  ${toGive.join(", ")}`);
	console.log(`${bestMatch.matchScore} CARDS TO RECEIVE  :  ${toReceive.join(", ")}`);
	console.log(
		`After this trade you are now missing ${padZeros(userDataCopy.missing.size)} cards and have ${padZeros(
			userDataCopy.duplicates.size,
		)} unique cards available for trade.`,
	);

	autoTrade({ results: sortedResultsCopy, userData: userDataCopy });
};

init().catch(ex => console.error(ex));
