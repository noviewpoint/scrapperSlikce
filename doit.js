var rp = require('request-promise');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const sliciceUsername = process.env.sliciceUsername || "marvin";

const scrape = async (mySpecialUsername) => {

    let count = 0;
    let endLoop = false;

    let data;
    let dom;
    const elements = [];
    let mySpecialData = {};

    while(!endLoop) {

        let url = "http://slicice.net/search/albums.html?go=true&id=51&position=" +  count;
        data = await rp(url);

        dom = new JSDOM(data);
        dom = dom.window.document.querySelectorAll("div.offersBrowserRight.fix.right");

        dom.forEach((el) => {

            domHead = el.querySelector("div.offersBrowserHead.fix");
            username = domHead.querySelector("a.userName").textContent;
            timestamp = domHead.querySelector("span.offerDate").textContent;
            
            domBody = el.querySelector("div.offersBrowserrEntry.fix");
            missing = domBody.querySelector("p.missing").textContent;
            var temp = missing.replace(/iščem: /g,'').replace(/\s/g,'').split(",");
            missing = temp.filter((el) => {
                return el !== "";
            }).map((el) => {
                return Number(el);
            });

            duplicates = domBody.querySelector("p.duplicates").textContent;
            var temp = duplicates.replace(/ponujam: /g,'').replace(/\s/g,'').split(",");
            duplicates = temp.filter((el) => {
                return el !== "";
            }).map((el) => {
                return Number(el);
            });

            if (username === mySpecialUsername) {
                console.log("Scrapper found your data for username", username, ". Storing your data");
                mySpecialData = {
                    username: username,
                    timestamp: timestamp,
                    missing: missing,
                    duplicates: duplicates
                };
            } else {
                elements.push({
                    username: username,
                    timestamp: timestamp,
                    missing: missing,
                    duplicates: duplicates,
                    matchedMyMissing: [],
                    matchedMyDuplicates: [],
                    matchScore: 0
                });
            }

        });

        if (dom.length === 0) {
            endLoop = true;
            console.log("Ending loop with a count of", count);
        } else {
            count++;
        }

    }

    calculateDiff(elements, mySpecialData);
    showMatches(elements);

};

const calculateDiff = (otherCollectors, myData) => {

    otherCollectors.forEach((collector) => {

        collector.missing.forEach((card) => {
            if (myData.duplicates.includes(card)) {
                collector.matchedMyDuplicates.push(card);
            }
        });

        collector.duplicates.forEach((card) => {
            if (myData.missing.includes(card)) {
                collector.matchedMyMissing.push(card);
            }
        });

        collector.matchScore = Math.min(collector.matchedMyDuplicates.length, collector.matchedMyMissing.length);

    });

    otherCollectors.sort((a, b) => {
        return a.matchScore - b.matchScore;
    });

};

const showMatches = (matches) => {

    let writeLog = "";

    matches.map((collector) => {

        var temp = `---------------------------------------------------------------------\n${collector.username} iz dne ${collector.timestamp} je tvoj match za ${collector.matchScore} sličic.\nPonuja ti ${collector.matchedMyMissing.length} sličic:\n${collector.matchedMyMissing}\nIšče ${collector.matchedMyDuplicates.length} sličic:\n${collector.matchedMyDuplicates}\n`;
        console.log(temp);
        writeLog += temp; 

    });

    fs.writeFile("log.txt", "", (err) => { // clear this txt file
        if (err) {
            throw err;
        }
        console.log("File cleared");
        fs.writeFile("log.txt", writeLog, (err) => {  
            if (err) {
                throw err;
            }
            console.log('Log saved!');
        });
    });

};

scrape(sliciceUsername);