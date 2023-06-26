const { readFile, writeFile } = require('node:fs/promises');
const axios = require('axios');
const { queryBatchInsertN2N } = require('./query');


const distanceDurationBetweenAllNodes = async () => {
  // console.log(new Date());

  let oldNodes = null;
  let newNodes = null;

  try {
    let contents = await readFile('./utilities/uploadfiles/n2ndata.json', { encoding: 'utf8' });
    contents = JSON.parse(contents);
    oldNodes = contents.old;
    newNodes = contents.new
  } catch (err) {
  }
  try {
    process.send('status:creating node pairs');
    let nodePairs = await getAllNodePairs(oldNodes, newNodes);

    oldNodes = null;
    newNodes = null;

    process.send('status:creating api urls');
    let apiUrls = await Promise.all(nodePairs.map(async (pair) => {
      pair.push({ url: await getApiUrls(pair) });
      return pair;
    }));

    nodePairs = null;

    // apiUrls = apiUrls.slice(0, 200);

    process.send('status:getting distance duration of node to node pair');

    let finalApiResultData = [];
    let apiResultData = null;

    for (let i = 0; i < Math.ceil(apiUrls.length / 100); ++i) {
      let j = 0;
      apiResultData = await Promise.allSettled(apiUrls.slice(i * 100, (i * 100) + 100).map(async (apiUrl) => {
        j = j + 1;
        return { originNode: apiUrl[0].node_id, destinationNode: apiUrl[1].node_id, url: apiUrl[2].url, result: await fetchDataFromApi(apiUrl[2].url, i, j) };
      }));

      apiResultData.forEach(rdata => finalApiResultData.push(rdata));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    apiResultData = null;
    apiUrls = null;


    process.send('status:parsing received data');
    const parsedData = await parseApiData(finalApiResultData);

    process.send('status:inserting batch data in node to node table');
    await queryBatchInsertN2N(parsedData);


    await writeFile('./utilities/uploadfiles/n2ndata.json', '', { encoding: 'utf8' });
  } catch (err) {
  }
  // console.log(new Date());
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
      } else {
        pairs.push([newNodes[i], newNodes[j]]);
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

// async function fetchDataFromApi(url, maxRetries = 8, retryDelay = 100) {
async function fetchDataFromApi(url, i, j, retryDelay = 5) {
  try {
    const response = await axios.get(url);
    r_data = await response.data;
    let res = { distance: await r_data.routes[0].distance, duration: await r_data.routes[0].duration };
    // console.log('success', i, '', j);
    return res;
  } catch (error) {
    // console.log('error', i, '', j);
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return await fetchDataFromApi(url, j, retryDelay + 5);
  }
}

const parseApiData = async (apiData) => {
  try {
    return await Promise.all(apiData.map(data => {
      const distance = data.value.result.distance;
      const duration = data.value.result.duration;
      const orig_node_id = data.value.originNode;
      const dest_node_id = data.value.destinationNode;
      return { orig_node_id, dest_node_id, distance, duration };
    }));
  } catch (error) {
  }
}


distanceDurationBetweenAllNodes();