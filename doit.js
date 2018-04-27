var rp = require('request-promise');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const moment = require('moment');

const sliciceUsername = process.env.sliciceUsername || "marvin";
const daysOld = process.env.daysOld || 7;

const excludeFromMyMissing = [];
const excludeFromMyDuplicates = [];

const scrape = async (mySpecialUsername) => {

    let count = 0;
    let dom = [];
    const elements = [];
    let mySpecialData = {};

    while(count === 0 || dom.length > 0) {

        const temp = new JSDOM(await rp("http://slicice.net/search/albums.html?go=true&id=51&position=" +  count));
        dom = temp.window.document.querySelectorAll("div.offersBrowserRight.fix.right");

        dom.forEach((el) => {

            const domHead = el.querySelector("div.offersBrowserHead.fix");
            const username = domHead.querySelector("a.userName").textContent;
            const timestamp = moment(domHead.querySelector("span.offerDate").textContent, 'DD-MM-YYYY').toDate();
            
            const domBody = el.querySelector("div.offersBrowserrEntry.fix");
            const tempMissing = domBody.querySelector("p.missing").textContent.replace(/iščem: /g,'').replace(/\s/g,'');
            let missing = tempMissing.split(",").filter((el) => {
                return el !== "";
            }).map((el) => {
                return Number(el);
            });

            const tempDuplicates = domBody.querySelector("p.duplicates").textContent.replace(/ponujam: /g,'').replace(/\s/g,'');
            let duplicates = tempDuplicates.split(",").filter((el) => {
                return el !== "";
            }).map((el) => {
                return Number(el);
            });

            if (username === mySpecialUsername) {

                console.log(`Scrapper found your data for username ${username}`);
                console.log(`Your are missing ${missing.length} cards in your album`);
                console.log(`You have ${duplicates.length} unique cards available for trade`);
            
                if (excludeFromMyMissing.length) {
                    missing = missing.filter((card) => {
                        if (excludeFromMyMissing.includes(card)) {
                            return false;
                        }
                        return true;
                    });
                    console.log(`Based on your correction you are now missing ${missing.length} cards in your album`);
                }

                if (excludeFromMyDuplicates.length) {
                    duplicates = duplicates.filter((card) => {
                        if (excludeFromMyDuplicates.includes(card)) {
                            return false;
                        }
                        return true;
                    });
                    console.log(`Based on your correction you now have ${duplicates.length} unique cards available for trade`);
                }

                mySpecialData = {
                    username: username,
                    timestamp: timestamp,
                    missing: missing,
                    duplicates: duplicates,
                    cardsByCollector: {},
                    recommendedTrade: []
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

        count++;

    }

    if (!mySpecialData.username) {
        console.log("You have not entered valid username. Ending program");
        return;
    }

    calculateDiff(elements, mySpecialData);
    showMatches(elements, mySpecialData);

};

const isGolden = (card) => {

    if (card % 20 === 0 && card > 19 && card < 660) {
        return true;
    }

    return false;

};

const isGroupPicture = (card) => {

    if (card % 20 === 1 && card > 19 && card < 660) {
        return true;
    }

    return false;

};

const isStadium = (card) => {

    if (card > 7 && card < 20) {
        return true;
    }

    return false;

};

const is1To7 = (card) => {

    if (card > 0 && card < 8) {
        return true;
    }

    return false;

};

const is660To669 = (card) => {

    if (card > 659 && card < 670) {
        return true;
    }

    return false;

}

const isRegular = (card) => {
    
    if (card % 20 !== 0 && card % 20 !== 1 && card > 21 && card < 660) {
        return true;
    }

    return false;

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
        collector.recommendedTrade = calculateRecommended(collector.matchedMyMissing, collector.matchedMyDuplicates, collector.matchScore);

    });

    otherCollectors.sort((a, b) => {
        return a.matchScore - b.matchScore;
    });

};

const searchCards = (duplicates, callback) => {

    for (let j = 0, length = duplicates.length; j < length; j++) {
        
        if (callback(duplicates[j])) {
            const temp = duplicates[j];
            duplicates.splice(j, 1);
            return temp;
        }

    }

};

const calculateRecommended = (missingRef, duplicatesRef, limitRef) => {

    // create copies
    let missing = JSON.parse(JSON.stringify(missingRef));
    let duplicates = JSON.parse(JSON.stringify(duplicatesRef));
    const limit = JSON.parse(JSON.stringify(limitRef));
    const recommended = [];

    for (let i = 0, length = missing.length; i < length; i++) {

        let a = missing[i];
        let b;

        if (isGolden(missing[i])) {
            b = searchCards(duplicates, isGolden);
        } else if (isGroupPicture(missing[i])) {
            b = searchCards(duplicates, isGroupPicture);
        } else if (isStadium(missing[i])) {
            b = searchCards(duplicates, isStadium);
        } else if (is1To7(missing[i])) {
            b = searchCards(duplicates, is1To7);
        } else if (is660To669(missing[i])) {
            b = searchCards(duplicates, is660To669);
        } else { // should be regular
            b = searchCards(duplicates, isRegular);
        }

        if (a && b) {
            recommended.push("[" + a + " - " + b + "]");
        }

        if (recommended.length === limit) {
            break;
        }

    }

    return recommended;

};

const showMatches = (matches, mySpecialData) => {

    let writeLog = "";

    var temp = "---------------------------------------------------------------------\n     SUITABLE COLLECTORS:     \n---------------------------------------------------------------------\n\n\n";
    writeLog += temp;

    matches.map((collector) => {

        if (collector.matchScore === 0) {
            return; // dont log empty matches
        }

        const matchedMyMissing = collector.matchedMyMissing.map((el) => {
            return padZeros(el);
        });

        const matchedMyDuplicates = collector.matchedMyDuplicates.map((el) => {
            return padZeros(el);
        });

        var temp = `---------------------------------------------------------------------\n${collector.username} iz dne ${collector.timestamp.toDateString()} je tvoj match za ${collector.matchScore} sličic.\n`;
        temp += `Ponuja ti ${matchedMyMissing.length} svojih sličic:\n${matchedMyMissing.join(", ")}\nIšče ${matchedMyDuplicates.length} tvojih sličic:\n${matchedMyDuplicates.join(", ")}\n`;
        temp += `Predlagam zamenjavo ${collector.recommendedTrade.length} sličic:\n${collector.recommendedTrade}\n`;
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
            console.log("Results stored to log.txt file");
        });
    });

};

const padZeros = (number) => {

    let temp = "" + number;
    while (temp.length < 3) {
        temp = "0" + temp;
    }
    return temp;

};

scrape(sliciceUsername);