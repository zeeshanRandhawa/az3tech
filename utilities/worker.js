const { readFile, writeFile } = require('node:fs/promises');
const axios = require('axios');
const { queryBatchInsertN2N } = require('./query');


const distanceDurationBetweenAllNodes = async () => {
  let oldNodes = null;
  let newNodes = null;

  try {
    let contents = await readFile('./utilities/uploadfiles/n2ndata.json', { encoding: 'utf8' });
    contents = JSON.parse(contents);
    oldNodes = contents.old;
    newNodes = contents.new
  } catch (err) {
    console.error(err.message);
  }
  // console.log(new Date());
  try {
    process.send('status:creating node pairs');
    const nodePairs = await getAllNodePairs(oldNodes, newNodes);

    process.send('status:creating api urls');
    let apiUrls = await Promise.all(nodePairs.map(async (pair) => {
      pair.push({ url: await getApiUrls(pair) });
      return pair;
    }));

    // apiUrls = apiUrls.slice(0, 25);

    process.send('status:getting distance duration of node to node pair');
    const apiResultData = await Promise.allSettled(apiUrls.map(async (apiUrl) => {
      // await new Promise(resolve => setTimeout(resolve, 25));
      return { originNode: apiUrl[0].node_id, destinationNode: apiUrl[1].node_id, url: apiUrl[2].url, result: await fetchDataFromApi(apiUrl[2].url) };
    }));

    // apiResultData.forEach(d => {
    //   console.log(d.value)
    //   console.log(d.value.result.routes[0].duration, d.value.result.routes[0].distance);
    // })
    process.send('status:parsing received data');
    const parsedData = await parseApiData(apiResultData);

    process.send('status:inserting batch data in node to node table');
    await queryBatchInsertN2N(parsedData);

    // process.send('status:completed');

    await writeFile('./utilities/uploadfiles/n2ndata.json', '', { encoding: 'utf8' });
  } catch (err) {
    console.error(err);
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
  return pairs;
}

const getApiUrls = async (nodePair) => {
  const lng1 = nodePair[0].long;
  const lat1 = nodePair[0].lat;
  const lng2 = nodePair[1].long;
  const lat2 = nodePair[1].lat;
  return `http://143.110.152.222:5000/route/v1/car/${lng1},${lat1};${lng2},${lat2}?steps=true&geometries=geojson&overview=full&annotations=true`;
}

async function fetchDataFromApi(url, i, maxRetries = 4, retryDelay = 100) {
  try {
    const response = await axios.get(url);
    r_data = await response.data;
    return r_data;
  } catch (error) {
    if (maxRetries > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return await fetchDataFromApi(url, maxRetries - 1, retryDelay * 2);
    } else {
      return error;
    }
  }
}

const parseApiData = async (apiData) => {
  return await Promise.all(apiData.map(data => {
    const distance = data.value.result.routes[0].distance;
    const duration = data.value.result.routes[0].duration;
    const orig_node_id = data.value.originNode;
    const dest_node_id = data.value.destinationNode;
    return { orig_node_id, dest_node_id, distance, duration };
  }));
}




// console.log(oldNodes);

// const [, , oldNodes, newNodes] = process.argv;


distanceDurationBetweenAllNodes();