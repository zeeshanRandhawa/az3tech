const { readFile, writeFile } = require('node:fs/promises');
const axios = require('axios');
const querystring = require('querystring');
const { fetchCoordinatesDataFromApi } = require('../utilities/utilities')
const { queryBatchInsertN2N, queryBatchInsertNodes } = require('./query');



const distanceDurationBetweenAllNodes = async () => {
  const start = new Date();

  let oldNodes = null;
  let nodesToInsert = null;

  try {
    let contents = await readFile('./utilities/uploadfiles/n2ndata.json', { encoding: 'utf8' });
    contents = JSON.parse(contents);
    oldNodes = contents.old;
    nodesToInsert = contents.newToInsert
  } catch (err) { }


  process.send('status:preparing bulk data from file');
  nodesToInsert = await prepareBulkData(nodesToInsert);

  process.send('status:Inserting bulk data in nodes table');
  nodesToInsert = await queryBatchInsertNodes(nodesToInsert.data);

  try {
    process.send('status:creating node pairs');
    let nodePairs = await getAllNodePairs(oldNodes, nodesToInsert.data);

    oldNodes = null;
    nodesToInsert = null;

    process.send('status:creating api urls');
    let apiUrls = await Promise.all(nodePairs.map(async (pair) => {
      pair.push({ url: await getApiUrls(pair) });
      return pair;
    }));

    nodePairs = null;
    process.send('status:getting distance duration of node to node pair');

    let finalApiResultData = [];
    let apiResultData = null;

    for (let i = 0; i < Math.ceil(apiUrls.length / 100); ++i) {
      let j = 0;
      apiResultData = await Promise.allSettled(apiUrls.slice(i * 100, (i * 100) + 100).map(async (apiUrl) => {
        j = j + 1;
        return { originNode: apiUrl[0].node_id, destinationNode: apiUrl[1].node_id, url: apiUrl[2].url, result: await fetchDataFromApi(apiUrl[2].url, i, j, 25) };
      }));

      apiResultData.forEach(rdata => finalApiResultData.push(rdata));
    }

    apiResultData = null;
    apiUrls = null;


    process.send('status:parsing received data');
    const parsedData = await parseApiData(finalApiResultData);

    process.send('status:inserting batch data in node to node table');
    await queryBatchInsertN2N(parsedData);
    await writeFile('./utilities/uploadfiles/n2ndata.json', '', { encoding: 'utf8' });

    // console.log((new Date()) - start);
  } catch (err) {
  }
}

const getAllNodePairs = async (oldNodes, newNodes) => {
  const pairs = [];
  for (let i = 0; i < newNodes.length; i++) {
    for (let j = 0; j < oldNodes.length; j++) {
      pairs.push([newNodes[i], oldNodes[j]]);
      pairs.push([oldNodes[j], newNodes[i]]);
    }
  }
  for (let i = 0; i < newNodes.length; i++) {
    for (let j = 0; j < newNodes.length; j++) {
      if (i != j) {
        pairs.push([newNodes[i], newNodes[j]]);
        pairs.push([newNodes[j], newNodes[i]]);
      }
    }
  }
  return pairs;
}

const getApiUrls = async (nodePair) => {
  const lng1 = nodePair[0].long;
  const lat1 = nodePair[0].lat;
  const lng2 = nodePair[1].long;
  const lat2 = nodePair[1].lat;
  return `http://143.110.152.222:5000/route/v1/car/${lng1},${lat1};${lng2},${lat2}?steps=true&geometries=geojson&overview=full&annotations=true`;
}

async function fetchDataFromApi(url, i, j, retryDelay) {
  try {
    const response = await axios.get(url);
    r_data = await response.data;
    let res = { distance: await r_data.routes[0].distance, duration: await r_data.routes[0].duration };
    // console.log('success', i, '', j);
    return res;
  } catch (error) {
    // console.log('error', i, '', j);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return await fetchDataFromApi(url, i, j, retryDelay + 5);
  }
}

const prepareBulkData = async (fileData) => {
  try {
    let i = 0;
    const results = [];
    for (let line of fileData) {
      const [location, description, address, city, state_province, zip_postal_code, transit_time] = line.split(',');
      let latLong = await fetchCoordinatesDataFromApi(`https://nominatim.openstreetmap.org/search/?q=${querystring.escape(address.trim().concat(' ').concat(state_province.trim()))}&format=json&addressdetails=1`, i, 25);
      results.push({ location: location, description: description, address: address, city: city, state_province: state_province, zip_postal_code: zip_postal_code, transit_time: transit_time, long: latLong.long, lat: latLong.lat });
      i = i + 1;
    };

    return { status: 200, data: results };
  } catch (error) {
    return { status: 500, message: "Server Error " + error.message };
  }
}

const parseApiData = async (apiData) => {
  try {
    return await Promise.all(apiData.map(data => {
      const distance = data.value.result.distance / 1000.0;
      const duration = data.value.result.duration / 60;
      const orig_node_id = data.value.originNode;
      const dest_node_id = data.value.destinationNode;
      return { orig_node_id, dest_node_id, distance, duration };
    }));
  } catch (error) {
  }
}


distanceDurationBetweenAllNodes();