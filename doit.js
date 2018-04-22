var rp = require('request-promise');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const moment = require('moment');

const sliciceUsername = process.env.sliciceUsername || "marvin";

const excludeFromMyMissing = [27,57,79,95,115,117,147,157,167,204,207,224,225,228,259,311,334,342,347,360,387,398,399,428,430,437,451,499,502,503,514,519,538,543,569,580,602,612,615,632,652];
const excludeFromMyDuplicates = [8,14,15,26,44,68,70,99,104,114,152,159,176,211,214,229,230,237,245,270,273,318,329,352,367,369,415,436,454,458,484,495,497,509,510,512,518,554,555,559,561,582,592,619,631,635];

const daysOld = process.env.daysOld || 7;

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
            timestamp = moment(domHead.querySelector("span.offerDate").textContent, 'DD-MM-YYYY').toDate();
            
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
                console.log(`Scrapper found your data for username ${username}. Storing your data`);

                console.log("V albumu ti manjka", missing.length, "sličic");
                console.log("Ponujaš", duplicates.length, "različnih sličic");
            
                if (excludeFromMyMissing.length) {
                    missing = missing.filter((card) => {
                        if (excludeFromMyMissing.includes(card)) {
                            return false;
                        }
                        return true;
                    });
                    console.log("S tvojim popravkom ti sedaj v albumu manjka", missing.length, "sličic");
                }

                if (excludeFromMyDuplicates.length) {
                    duplicates = duplicates.filter((card) => {
                        if (excludeFromMyDuplicates.includes(card)) {
                            return false;
                        }
                        return true;
                    });
                    console.log("S tvojim popravkom sedaj ponujaš", duplicates.length, "sličic");
                }

                mySpecialData = {
                    username: username,
                    timestamp: timestamp,
                    missing: missing,
                    duplicates: duplicates,
                    cardsByCollector: {}
                };
            } else {
                let d = new Date();
                d.setDate(d.getDate() - daysOld);
                if (new Date(timestamp) < d) {
                    return; // drop this element, too old
                }

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

    if (!mySpecialData.username) {
        console.log("You have not entered valid username. Ending program");
        return;
    }

    calculateDiff(elements, mySpecialData);
    showMatches(elements, mySpecialData);

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
                if (!Array.isArray(myData.cardsByCollector[card])) { // initialize array if not already an array
                    myData.cardsByCollector[card] = [];
                }
                myData.cardsByCollector[card].push(collector.username);
            }
        });

        collector.matchScore = Math.min(collector.matchedMyDuplicates.length, collector.matchedMyMissing.length);

    });

    otherCollectors.sort((a, b) => {
        return a.matchScore - b.matchScore;
    });

};

const showMatches = (matches, mySpecialData) => {

    let writeLog = "";

    var temp = "---------------------------------------------------------------------\n     SUITABLE COLLECTORS:     \n---------------------------------------------------------------------\n\n\n";
    writeLog += temp;

    matches.map((collector) => {

        var temp = `---------------------------------------------------------------------\n${collector.username} iz dne ${collector.timestamp} je tvoj match za ${collector.matchScore} sličic.\n`;
        temp += `Ponuja ti ${collector.matchedMyMissing.length} sličic:\n${collector.matchedMyMissing}\nIšče ${collector.matchedMyDuplicates.length} sličic:\n${collector.matchedMyDuplicates}\n`;
        temp += `Predlagam zamenjavo ${collector.matchScore} njegovih sličic:\n${collector.matchedMyMissing.slice(0, collector.matchScore)}\nza ${collector.matchScore} tvojih:\n${collector.matchedMyDuplicates.slice(0, collector.matchScore)}\n`;
        writeLog += temp; 

    });

    var temp = "\n\n\n\n---------------------------------------------------------------------\nYOUR MISSING CARDS BY COLLECTOR:\n---------------------------------------------------------------------\n\n" + JSON.stringify(mySpecialData.cardsByCollector, null, 4);
    writeLog += temp;

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
            console.log("Rezultati zabeleženi v log.txt datoteki");
        });
    });

};

scrape(sliciceUsername);