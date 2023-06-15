const fs = require('fs');
const axios = require('axios');

// async function distanceDurationBetweenAllNodes() {
//   try {
//     // const fetch = await import('node-fetch');
//     const nodes = await getAllNodes();
//     const nodePairs = getAllNodePairs(nodes);
//     const apiUrls = getApiUrls(nodePairs);
//     // console.log(await fetchDataFromApi(apiUrls[0]));
//     // return;
//     // const data = await Promise.all(apiUrls.map(apiUrl => fetchDataFromApi(fetch, apiUrl)));
//     const data = await Promise.all(apiUrls.map(apiUrl => fetchDataFromApii(apiUrl)));
//     console.log(data[0]);
//     return;
//     const results = parseApiData(data);
//     await saveDataToCsv(results);
//     console.log('Data saved to CSV file successfully!');
//   } catch (err) {
//     console.error(err);
//   }
// }

const distanceDurationBetweenAllNodes = async (oldNodes, newNodes) => {
  try {
    const nodePairs = await getAllNodePairs(oldNodes, newNodes);
    let apiUrls = await Promise.all(nodePairs.map(async (pair) => {
      pair.push({ url: await getApiUrls(pair) });
      return pair;
    }));
    apiUrls = apiUrls.slice(0, 10);

    const apiResultData = await Promise.allSettled(apiUrls.map(async (apiUrl) => {
      await new Promise(resolve => setTimeout(resolve, 150));
      return await { originNode: apiUrl[0].node_id, destinationNode: apiUrl[1].node_id, url: apiUrl[2].url, result: await fetchDataFromApi(apiUrl[2].url) };
    }));

    // apiResultData.forEach(d => {
    //   console.log(d.value)
    //   console.log(d.value.result.routes[0].duration, d.value.result.routes[0].distance);
    // })

    const parsedData = await parseApiData(apiResultData);


    console.log(parsedData)
  } catch (err) {
    console.error(err);
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
  return pairs;
}

const getApiUrls = async (nodePair) => {
  const lng1 = nodePair[0].long;
  const lat1 = nodePair[0].lat;
  const lng2 = nodePair[1].long;
  const lat2 = nodePair[1].lat;
  return `http://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?steps=true&geometries=geojson&overview=full&annotations=true`;
}

async function fetchDataFromApi(url, i, maxRetries = 4, retryDelay = 500) {
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
  return await Promise.allSettled(apiData.map(data => {
    const distance = data.value.result.routes[0].distance;
    const duration = data.value.result.routes[0].duration;
    const origNodeId = data.value.originNode;
    const destNodeId = data.value.destinationNode;
    return { origNodeId, destNodeId, distance, duration };
  }));
}


// function getAllNodePairs(nodes) {
//   const pairs = [];
//   for (let i = 0; i < nodes.length; i++) {
//     for (let j = 0; j < nodes.length; j++) {
//       if (i != j) {
//         pairs.push([nodes[i], nodes[j]]);
//       }
//     }
//   }
//   return pairs;
// }

// function getApiUrls(nodePairs) {
//   return nodePairs.map(pair => {
//     const lng1 = pair[0].long;
//     const lat1 = pair[0].lat;
//     const lng2 = pair[1].long;
//     const lat2 = pair[1].lat;
//     return `http://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?steps=true&geometries=geojson&overview=full&annotations=true`;
//   });
// }

// async function fetchDataFromApi(fetch, apiUrl) {
// const fetchDataFromApi = async (apiUrl) => {
//   await axios.get(apiUrl[2].url).then(
//     function (response) {
//       return response.data;
//     }
//   ).catch(
//     (error) => console.log(error)
//   )
// }

// function saveDataToCsv(data) {
//   return new Promise((resolve, reject) => {
//     const headers = Object.keys(data[0]).join(',') + '\n';
//     let rows = '';
//     data.forEach((row) => {
//       const values = Object.values(row).join(',') + '\n';
//       rows += values;
//     });
//     const csvData = headers + rows;

//     fs.writeFile('./node_distances.csv', csvData, (err) => {
//       if (err) {
//         reject(err);
//       } else {
//         resolve();
//       }
//     });
//   });
// }

module.exports = { distanceDurationBetweenAllNodes };
