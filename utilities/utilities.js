
const bcrypt = require('bcrypt');
const axios = require('axios');
const { queryTableCount } = require('./query');
const geolib = require('geolib');

const math = require('mathjs');
const haversine = require('haversine-distance');

const getpageCount = async (req, res) => {
  try {
    const routeTags = (req.query.tagsList != null && req.query.tagsList != '') ? req.query.tagsList.split(',') : null;
    const searchName = (req.query.name != null && req.query.name != '') ? req.query.name : null;
    const searchAddress = (req.query.address != null && req.query.address != '') ? req.query.address : null;
    if (!req.query.tableName) {
      return res.status(400).json({ message: 'Invalid Data' });
    } else {
      const countRes = await queryTableCount(req.query.tableName, req.query.id, routeTags, searchName, searchAddress);
      if (countRes.status == 200) {
        res.status(200).json({ "pageCount": countRes.data });
      } else {
        res.status(countRes.status).json({ message: countRes.data }); // error handling
      }
    }
  } catch (error) {
    // logDebugInfo('error', 'batch_insert', 'riders', error.message, error.stack);
    res.status(500).json({ message: "Server Error " + error.message });
  }
}



const hashPassword = (password) => {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        reject(err);
      } else {
        resolve(hash.toString('hex'));
      }
    });
  });
};


const getRouteInfo = async (pointA, pointB, maxRetries = 4, retryDelay = 100) => {
  try {
    url = `http://143.110.152.222:5000/route/v1/car/${pointA[0]},${pointA[1]};${pointB[0]},${pointB[1]}?steps=true&geometries=geojson&overview=full&annotations=true`;
    const response = await axios.get(url);
    r_data = await response.data;
    return r_data;
  } catch (error) {
    if (maxRetries > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return await getRouteInfo(pointA, pointB, maxRetries - 1, retryDelay * 2);
    } else {
      return error;
    }
  }
}



const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};





const calculateDistance = (pointA, pointB) => {
  const R = 6371; // Earth's radius in kilometers

  const lat1 = pointA.lat;
  const lon1 = pointA.long;
  const lat2 = pointB.lat;
  const lon2 = pointB.long;

  const dLon = lon2 - lon1;

  const centralAngle = Math.acos(
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon)
  );

  const distance = R * centralAngle; // Distance in kilometers

  return distance;
};




const formatNodeData = (nodesData, waypointDistance) => {
  return nodesData.map((node) => {
    if (!('isWaypoint' in node)) {
      node = { 'isWaypoint': false, 'distance': 0, ...node };
    } else if (node.distance > waypointDistance) {
      node.distance = 0;
      node.isWaypoint = false;
    }
    return node;
  })
};


function hasSignificantCurve(coordinates) {
  // Calculate the distances between consecutive points
  const distances = [];

  for (let i = 1; i < coordinates.length; i++) {
    // const distance = geolib.getDistance({latitude: coordinates[i - 1][1], longitude: coordinates[i - 1][0]}, {latitude: coordinates[i][1], longitude: coordinates[i][0]});
    const bearing = geolib.getRhumbLineBearing({ latitude: coordinates[i - 1][1], longitude: coordinates[i - 1][0] }, { latitude: coordinates[i][1], longitude: coordinates[i][0] })
    distances.push(bearing);
  }

  // Calculate the standard deviation of the distances
  const mean = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  const variance = distances.reduce((sum, distance) => sum + Math.pow(distance - mean, 2), 0) / distances.length;
  const standardDeviation = Math.sqrt(variance);

  // Define a threshold for significant curve detection
  const threshold = 2; // Adjust this value according to your needs

  // Determine if the line has a significant curve
  // console.log(standardDeviation)
  return standardDeviation > threshold;
}

// Example usa

const getDistances = (lineStart, lineEnd, nodePoint, curve, allPoints) => {

  if (curve) {

    let smallest = ""
    allPoints.forEach(point => {

      let thisDistance = geolib.getDistance({ latitude: point[1], longitude: point[0] }, { latitude: nodePoint.lat, longitude: nodePoint.long })

      if (smallest == "") {

        smallest = thisDistance;
      }
      else {
        smallest = thisDistance <= smallest ? thisDistance : smallest;
      }
    });


    const result = {
      distance: smallest,
      intercepted: true
    };
    return result
  }

  let A = { latitude: lineStart[1], longitude: lineStart[0] }
  let B = { latitude: lineEnd[1], longitude: lineEnd[0] }
  let point = { latitude: nodePoint.lat, longitude: nodePoint.long }

  let distance = geolib.getDistanceFromLine(
    point,
    A,
    B
  );

  const result = {
    distance: distance,
    intercepted: true
  };

  return result
}



function findParallelLines(dataPoints) {
  const A = dataPoints[0]
  const B = dataPoints[1]
  // Convert latitude and longitude to radians
  const lat_A = math.unit(dataPoints[0][1], 'deg').to('rad').value;
  const lon_A = math.unit(dataPoints[0][0], 'deg').to('rad').value;
  const lat_B = math.unit(dataPoints[1][1], 'deg').to('rad').value;
  const lon_B = math.unit(dataPoints[1][0], 'deg').to('rad').value;

  // Calculate the angle of line AB
  const d_lon = lon_B - lon_A;
  const y = math.sin(d_lon) * math.cos(lat_B);
  const x = math.cos(lat_A) * math.sin(lat_B) - math.sin(lat_A) * math.cos(lat_B) * math.cos(d_lon);


  const angle = Math.atan2(y, x);
  const L = calculateDistance({ lat: toRadians(A[1]), long: toRadians(A[0]) }, { lat: toRadians(B[1]), long: toRadians(B[0]) }) / 4
  // Calculate the perpendicular offset
  const offset = L / (6371 * 1000); // 6371 km is the average radius of the Earth

  // Calculate the coordinates of the parallel lines
  const lat_offset = offset * Math.cos(angle);
  const lon_offset = offset * Math.sin(angle);

  const parallel_line_1 = [
    [A[1] - lat_offset, A[0] + lon_offset],
    [B[1] - lat_offset, B[0] + lon_offset]
  ];

  const parallel_line_2 = [
    [A[1] + lat_offset, A[0] - lon_offset],
    [B[1] + lat_offset, B[0] - lon_offset]
  ];

  // Convert back to degrees
  const parallel_line_1_deg = parallel_line_1.map(coord => [
    math.unit(coord[0], 'rad').to('deg').value,
    math.unit(coord[1], 'rad').to('deg').value
  ]);
  const parallel_line_2_deg = parallel_line_2.map(coord => [
    math.unit(coord[0], 'rad').to('deg').value,
    math.unit(coord[1], 'rad').to('deg').value
  ]);


  // return [parallel_line_1_deg, parallel_line_2_deg];
  return [[parallel_line_1_deg[0][1], parallel_line_1_deg[0][0]], [parallel_line_1_deg[1][1], parallel_line_1_deg[1][0]], [parallel_line_2_deg[0][1], parallel_line_2_deg[0][0]], [parallel_line_2_deg[1][1], parallel_line_2_deg[1][0]]]
}

function calculateDistanceBetweenPoints(A, B) {
  return geolib.getDistance(A, B)
}


async function fetchCoordinatesDataFromApi(url, i, retryDelay) {
  try {
    const response = await axios.get(url);
    if (await response.status == 200) {
      console.log("success", i)
      r_data = await response.data;
      if (r_data.length > 0) {
        return { lat: await r_data[0].lat, long: await r_data[0].lon };
      }
      return { lat: null, long: null };
    } else {
      throw new Error();
    }
  } catch (error) {
    console.log(error)
    console.log("error", i)
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return await fetchCoordinatesDataFromApi(url, i, retryDelay + 100);
  }
}


async function fetchDistanceDurationFromCoordinates(url, retryDelay = 100) {
  try {
    const response = await axios.get(url);
    if (await response.status == 200) {
      r_data = await response.data;
      if (r_data.routes.length > 0) {
        return { distance: await r_data.routes[0].distance, duration: await r_data.routes[0].duration };
      }
      return { distance: null, duration: null };
    } else {
      throw new Error();
    }
  } catch (error) {
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return await fetchDistanceDurationFromCoordinates(url, retryDelay + 100);
  }
}


async function fetchCoordinatesDataFromApiGMap(address, i, retryDelay) {
  try {
    const baseUrl = "https://maps.googleapis.com/maps/api/geocode/json";
    const params = {
      address: address,
      key: "AIzaSyAlcoiLrtWjyilkky2rKqhnRLiN7v3eZM0",
    };

    const response = await axios.get(baseUrl, { params });
    const data = response.data;
    if (data.status === "OK") {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, long: location.lng };
    } else {
      throw new Error();
    }
  } catch (error) {
    // console.log("error", i)
    await new Promise(resolve => setTimeout(resolve, retryDelay));
    return await fetchCoordinatesDataFromApiGMap(address, i, retryDelay + 100);
  }
}


// return very first node and last node in route
// if no data returned or more than 2 nodes returned then either origin node or destination node is not unique
const getOrigDestNode = (rNodes) => {
  // extract destinct nodes
  const originNodeList = rNodes.map(rNode => rNode.origin_node);
  const destinationNodeList = rNodes.map(rNode => rNode.destination_node);

  // contain first and last node
  let actualOriginNodes = [];
  let actualDestinationNodes = [];


  // take node from origin filter from destination will get origin node that is unique adn vice versa
  rNodes.forEach((rNode) => {
    if (destinationNodeList.filter(item => item !== rNode.origin_node).length === destinationNodeList.length) {
      actualOriginNodes.push(rNode.origin_node)
    }
    if (originNodeList.filter(item => item !== rNode.destination_node).length === originNodeList.length) {
      actualDestinationNodes.push(rNode.destination_node)
    }
  });


  // if length is not exactly one return null
  if (actualOriginNodes.length != 1 || actualDestinationNodes.length != 1) {
    return { origNode: null, destNode: null };
  }
  // else return data
  return { origNode: actualOriginNodes[0], destNode: actualDestinationNodes[0] };

  // if (actualOriginNodes.length == 1 && actualDestinationNodes.length == 1) {
  //     return false;
  // }
  // return true;
}

// sort route nodes data by dest of 1st and orig of 2nd
// take route node list and satrting origin node
function sortRouteNodeList(routeNodes, startOrigNode) {
  // store ordered list
  const reorderedList = [];

  // satrt from origin node
  let nextNode = startOrigNode;


  // if length of routeNodes is not 0 
  while (routeNodes.length > 0) {
    // it will always give origin index 
    const nextIndex = routeNodes.findIndex((node) => node.origin_node === nextNode);
    if (nextIndex === -1) {
      break;
    }

    // splite the pair and add to ordered list
    const nextDict = routeNodes.splice(nextIndex, 1)[0];

    reorderedList.push(nextDict);

    // change reference to dest node of first pair
    nextNode = nextDict.destination_node;
  }

  return reorderedList;

}

module.exports = { sortRouteNodeList, getOrigDestNode, getpageCount, formatNodeData, hashPassword, getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, calculateDistanceBetweenPoints, fetchCoordinatesDataFromApi, fetchDistanceDurationFromCoordinates };

// 37.79103509151187, -122.42789800130387
// 37.74041824562184, -122.46978337728044