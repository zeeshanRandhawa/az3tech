const fs = require('fs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');

async function updateCSVFile(filePath) {
    // Read the CSV file
    const rows = [];
    const uniqueLocIDs = new Set();
    let shouldUpdate = false;
    const data = await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          rows.push(row);
          const locID = row.LocID.toString().trim();
          if (!isValidLocID(locID) || uniqueLocIDs.has(locID)) {
            shouldUpdate = true;
          }
          uniqueLocIDs.add(locID);
        })
        .on('end', () => {
          resolve(rows);
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  
    // Update the LocID column if needed
    if (shouldUpdate) {
      data.forEach((row) => {
        let locID = row.LocID.toString().trim();
        if (!isValidLocID(locID) || uniqueLocIDs.has(locID)) {
          locID = generateLocID();
          while (uniqueLocIDs.has(locID)) {
            locID = generateLocID();
          }
          row.LocID = locID;
          uniqueLocIDs.add(locID);
        }
      });
  
      // Write the changes back to the CSV file
      await new Promise((resolve, reject) => {
        const headers = Object.keys(data[0]).map((value) => `"${value}"`).join(',') + '\n';
        let rows = '';
        data.forEach((row) => {
          const values = Object.values(row).map((value) => `"${value}"`).join(',') + '\n';
          rows += values;
        });
        const csvData = headers + rows;
  
        fs.writeFile(filePath, csvData, (err) => {
          if (err) {
            reject(err);
          } else {
            // console.log('CSV file updated successfully!');
            resolve();
          }
        });
      });
    }
  }
  
  function isValidLocID(locID) {
    return /^[0-9]{4}-[0-9]{5}$/.test(locID);
  }
  
  function generateLocID() {
    const firstPart = Math.floor(Math.random() * (9999 - 1000 + 1) + 1000).toString();
    const secondPart = Math.floor(Math.random() * (99999 - 10000 + 1) + 10000).toString();
    return `${firstPart}-${secondPart}`;
  }


function readCSVFile(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', (err) => {
          console.error(err);
          reject(err);
        });
    });
  }

function appendDataToCSVFile(filePath, data) {
  return new Promise((resolve, reject) => {
    const newDataRow = Object.values(data)
      .map((value) => `"${value.toString().replace(/'/g, "''")}"`) // wrap each value in quotes
      .join(',') + '\n';

    fs.appendFile(filePath, newDataRow, (err) => {
      if (err) {
        reject(err);
      } else {
        // console.log('Data added to CSV file successfully!');
        resolve();
      }
    });
  });
}
  

module.exports = {
  readCSVFile,
  appendDataToCSVFile,
  updateCSVFile,
};
