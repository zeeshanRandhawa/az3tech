
const bcrypt = require('bcrypt');
const axios = require('axios');
const { queryTableCount } = require('./query');
const geolib = require('geolib');

const math = require('mathjs');
const haversine = require('haversine-distance');

const getpageCount = async (req, res) => {
  try {
    const routeTags = (req.query.tagsList != null && req.query.tagsList != '') ? req.query.tagsList.split(',') : null;
    if (!req.query.tableName) {
      return res.status(400).json({ message: 'Invalid Data' });
    } else {
      const countRes = await queryTableCount(req.query.tableName, req.query.id, routeTags);
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


const getRouteInfo = async (pointA, pointB, maxRetries = 4, retryDelay = 500) => {
  try {
    url = `http://router.project-osrm.org/route/v1/driving/${pointA[0]},${pointA[1]};${pointB[0]},${pointB[1]}?steps=true&geometries=geojson&overview=full&annotations=true`;
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



  function hasSignificantCurve(coordinates) {
    // Calculate the distances between consecutive points
    const distances = [];
    
    for (let i = 1; i < coordinates.length; i++) {
      // const distance = geolib.getDistance({latitude: coordinates[i - 1][1], longitude: coordinates[i - 1][0]}, {latitude: coordinates[i][1], longitude: coordinates[i][0]});
      const bearing = geolib.getRhumbLineBearing({latitude: coordinates[i - 1][1], longitude: coordinates[i - 1][0]}, {latitude: coordinates[i][1], longitude: coordinates[i][0]})
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

  const getDistances = (lineStart, lineEnd, nodePoint, curve, allPoints) =>{

    if(curve){
      
      let smallest = ""
      allPoints.forEach(point => {
        
        let thisDistance = geolib.getDistance({latitude: point[1], longitude: point[0]}, {latitude: nodePoint.lat, longitude: nodePoint.long})
      
        if(smallest == ""){
          
          smallest = thisDistance;
        }
        else{
          smallest = thisDistance<=smallest? thisDistance : smallest;
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
    const L = calculateDistance({lat: toRadians(A[1]), long: toRadians(A[0])}, {lat: toRadians(B[1]), long: toRadians(B[0])} )/4
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
    return [ [parallel_line_1_deg[0][1], parallel_line_1_deg[0][0]], [parallel_line_1_deg[1][1], parallel_line_1_deg[1][0]], [parallel_line_2_deg[0][1], parallel_line_2_deg[0][0]], [parallel_line_2_deg[1][1], parallel_line_2_deg[1][0]]]
  }
  



module.exports = { getpageCount, hashPassword, getRouteInfo, findParallelLines , getDistances, hasSignificantCurve};

// 37.79103509151187, -122.42789800130387
// 37.74041824562184, -122.46978337728044