const request = require("request-promise");
var AWS = require('aws-sdk');
const moment = require('moment');
const schedule = require('node-schedule');
const fs = require('fs');

let rawConfig = fs.readFileSync('./src/config.json');
let CONFIG = JSON.parse(rawConfig);

AWS.config.update({ region: 'us-east-1', accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,  secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY });
const REFRESH_IN_MIN = 30;
const HOURS_OF_OPERATION = '07-23';

// TO RUN:
// node src/server.js

// TO RUN BABEL:
// npm run build

// all the keys:
// https://kvdb.io/KEY/
// delete a key:
// curl -XDELETE https://kvdb.io/KEY/LISTING_ID

let toBeSent = [];

console.log('REFRESH: ' + REFRESH_IN_MIN + ' MIN');


async function main() {
  let currentTime = moment();
  
  console.log('\nQuerying craigslist, time=' + currentTime.format());

  toBeSent = [];

  console.log('-----------------------------------------------TOP FLOOR PLACES ALL DATES----------------------------------------');
  let result = await request('https://vancouver.craigslist.org/jsonsearch/apa/?postedToday=1&search_distance=6&postal=V6B3H8&min_price=1700&max_price=2200&availabilityMode=0&sale_date=all+dates', { json: true });
  await process(result[0], isTopFloor)

  // console.log('------------------------------------------------AFTER 30 DAYS---------------------------------------------');
  // result = await request('https://vancouver.craigslist.org/jsonsearch/apa/?postedToday=1&search_distance=6&postal=V6Z3H8&min_price=1700&max_price=2100&availabilityMode=2&laundry=1&sale_date=all+dates', { json: true });
  // await process(result[0], () => true);
}


async function process(listings, isWorthy) {
  if (listings) {
    // console.log(result);

    return Promise.all(
      listings.map(async element => {
        console.log(`Processing ${element.PostingID} ${element.PostingTitle}`);

        if (element.PostingTitle == null) {
          await processGeoCluster(element, isWorthy);
        } else if (isWorthy(element.PostingTitle)) {
          console.log('WORTHY!');
          await checkIfExists(element);
        }
      })
    ).then(function() {
      if (toBeSent.length > 0) {
        sendEmail();
      }
    }, function(err) {
        console.error(err);
    });
  }
}

function isTopFloor(postingTitle) {
  if (postingTitle == null) return false;
  
  const lowerCaseTitle = postingTitle.toLowerCase();

  return (lowerCaseTitle.includes('top')
    || lowerCaseTitle.includes('penthouse')
    // || lowerCaseTitle.includes('floor')
	|| lowerCaseTitle.includes('upper')) 
	&& 	!lowerCaseTitle.includes('sub penthouse')
	&& 	!lowerCaseTitle.includes('sub-penthouse')
	&& 	!lowerCaseTitle.includes('subpenthouse')
	&& 	!lowerCaseTitle.includes('ground floor')
	&& 	!lowerCaseTitle.includes('ground-floor')
}

async function processGeoCluster(element, isWorthy) {
  let geoClusterIDs = element.PostingID.split(',');
  console.log('GeoCluster....IDs:' + geoClusterIDs);

  let allInCluster = await request(`https://vancouver.craigslist.org${element.url}`, { json: true });
  let wanted = allInCluster[0].filter(x => geoClusterIDs.some(y => y == x.PostingID));
  console.log(`Wanted: ${wanted.length}`);

  for (item of wanted) {
    if (isWorthy(item.PostingTitle)) {
      await checkIfExists(item);
    }
  }
}

async function checkIfExists(element) {
  console.log(`Checking ${element.PostingID}`);
  return await request(`https://kvdb.io/${CONFIG.KVDB_TOKEN}/${element.PostingID}`, { json: true })
        .then(function (body) {
          console.log(`${element.PostingID} already exists`);
        })
        .catch(function (err) {
          toBeSent.push({'url' : element.PostingURL , 'title' :  element.PostingTitle});

          console.log(`Storing ${element.PostingID} ${element.PostingTitle}`);
          request({
            url: `https://kvdb.io/${CONFIG.KVDB_TOKEN}/${element.PostingID}`,
            method: 'POST',
            json: 'T'
          });
        });
}

function sendEmail() {
  console.log('Sending an email. ' + JSON.stringify(toBeSent));

  var params = {
    Destination: { 
      ToAddresses: [
        CONFIG.EMAIL
      ]
    },
    Message: { 
      Body: { 
        Text: {
          Charset: "UTF-8",
          Data:  toBeSent.map(x => x.url + ' - ' + x.title).join('\n')
        }
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'New listings'
      }
    },
    Source: CONFIG.EMAIL
  };

  // create the promise and SES service object
  var sendPromise = new AWS.SES({ apiVersion: '2010-12-01' }).sendEmail(params).promise();

  sendPromise.then(
    function (data) {
       console.log('Email sent.');
    }).catch(
      function (err) {
        console.error(err, err.stack);
      });
}


main();
schedule.scheduleJob(`*/${REFRESH_IN_MIN} ${HOURS_OF_OPERATION} * * *`, function () {
  main();
});



