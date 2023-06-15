
const bcrypt = require('bcrypt');
const axios = require('axios');
const { queryTableCount } = require('./query');

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


// const isIntermediateNode = async (lineA, lineB, nodePoint) => {

//   let m_initial = (lineB[1] - lineA[1]) / (lineB[0] - lineA[0]);
//   let c_initial = lineA[1] - (m_initial * lineA[0]);

//   let a1 = -1 * m_initial
//   let b1 = 1
//   let c1 = -1 * c_initial

//   let m = -1 * (1 / m_initial);

//   let a2 = -1 * m
//   let b2 = 1
//   let c2 = (-1 * (-1 * (m * nodePoint.long)) + nodePoint.lat);

//   let x = ((b1 * c2) - (b2 * c1)) / ((a1 * b2) - (a2 * b1))
//   let y = ((a2 * c1) - (a1 * c2)) / ((a1 * b2) - (a2 * b1))


//   // let x = (1*(-1 * c))-(1*(-1 * c1))/((-1 * m1)*1)-((-1 * m)*1);
//   // let y = ((-1 * m)*(-1 * c1))-((-1 * m1)*(-1 * c))/((-1 * m1)*1)-((-1 * m)*1);

//   // console.log(x, y);

//   // console.log(lineA);
//   // console.log(lineB);
//   // console.log(nodePoint);
// }
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

// Calculate the Great Circle Distance between two points on the Earth's surface
// const calculateDistance = (pointA, pointB) => {
//   const R = 6371; // Earth's radius in kilometers

//   const lat1 = toRadians(pointA.lat);
//   const lon1 = toRadians(pointA.long);
//   const lat2 = toRadians(pointB.lat);
//   const lon2 = toRadians(pointB.long);

//   const dLon = lon2 - lon1;

//   const centralAngle = Math.acos(
//     Math.sin(lat1) * Math.sin(lat2) +
//     Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon)
//   );

//   const distance = R * centralAngle; // Distance in kilometers

//   return distance;
// };




const calculateDistanceH = (pointA, pointB) => {
  const coordinatesA = {
    latitude: pointA.lat,
    longitude: pointA.long,
  };

  const coordinatesB = {
    latitude: pointB.lat,
    longitude: pointB.long,
  };

  const distance = haversine(coordinatesA, coordinatesB, { unit: 'm' });

  return distance;
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

const calculateGreatCircleDistance = (pointA, pointB) => {
  const earthRadius = 6371; // Earth's radius in kilometers
  const lat1 = pointA.lat;
  const lon1 = pointA.long;
  const lat2 = pointB.lat;
  const lon2 = pointB.long;

  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  const distance = earthRadius * c;

  return distance;
}

// const findPerpendicularLength = (AB, BC, CA) => {
//   const s = (AB + BC + CA) / 2; // Semiperimeter
//   const area = Math.sqrt(s * (s - AB) * (s - BC) * (s - CA)); // Area of the triangle
//   const perpendicularLength = (2 * area) / AB; // Length of the perpendicular

//   return perpendicularLength;
// }
const findPerpendicularLength = (pointA, pointB, pointC) => {
  
  // Convert latitude and longitude to radians
  const latA = pointA.lat 
  const lonA = pointA.lon 
  const latB = pointB.lat 
  const lonB = pointB.lon 
  const latC = pointC.lat 
  const lonC = pointC.lon

  // Calculate the great circle distance between the points using the Haversine formula
  const distanceAB = calculateDistance(pointA, pointB);
  const distanceBC = calculateDistance(pointB, pointC);
  const distanceCA = calculateDistance(pointC, pointA);
  // console.log("AB: ",distanceAB, "BC: ",distanceBC, "CA: ",distanceCA)
  const s = (distanceAB + distanceBC + distanceCA) / 2; // Semiperimeter
  const area = Math.sqrt(s * (s - distanceAB) * (s - distanceBC) * (s - distanceCA)); // Area of the triangle
  const perpendicularLength = (2 * area) / distanceAB; // Length of the perpendicular

  return perpendicularLength;
}

// const calculateTriangleAngles = (sideA, sideB, sideC)=> {
//   // Calculate angle BAC using the Law of Cosines
//   const angleBAC = Math.acos(
//     (sideB * sideB + sideC * sideC - sideA * sideA) / (2 * sideB * sideC)
//   );

//   // Calculate angle ABC using the Law of Sines
//   const angleABC = Math.asin((sideB * Math.sin(angleBAC)) / sideA);

//   // Convert angles to degrees
//   const angleBACDegrees = angleBAC * (180 / Math.PI);
//   const angleABCDegrees = angleABC * (180 / Math.PI);

//   return { 
//     BAC: angleBACDegrees > 90 ? false :angleBACDegrees,
//     ABC: angleABCDegrees >  90 ? false :angleABCDegrees,
//   };
// }

// const calculateTriangleAngles = (pointA, pointB, pointC) => {
//   // Convert latitude and longitude to radians
//   const latA = pointA.lat 
//   const lonA = pointA.lon 
//   const latB = pointB.lat 
//   const lonB = pointB.lon 
//   const latC = pointC.lat 
//   const lonC = pointC.lon 

//   // Calculate the great circle distances between the points
//   const sideA = calculateGreatCircleDistance(latB, lonB, latC, lonC);
//   const sideB = calculateGreatCircleDistance(latC, lonC, latA, lonA);
//   const sideC = calculateGreatCircleDistance(latA, lonA, latB, lonB);

//   // Calculate angle BAC using the Law of Cosines
//   const angleBAC = Math.acos(
//     (sideB * sideB + sideC * sideC - sideA * sideA) / (2 * sideB * sideC)
//   );

//   // Calculate angle ABC using the Law of Sines
//   const angleABC = Math.asin((sideB * Math.sin(angleBAC)) / sideA);

//   // Convert angles to degrees
//   const angleBACDegrees = angleBAC * (180 / Math.PI);
//   const angleABCDegrees = angleABC * (180 / Math.PI);

//   return { 
//     BAC: angleBACDegrees > 90 ? false : angleBACDegrees,
//     ABC: angleABCDegrees > 90 ? false : angleABCDegrees,
//   };
// }

const calculateTriangleAngles = (A, B, C) =>{
  const ABC = toDegrees(Math.acos((B^2 + C^2 - A^2) / (2 * B * C)))
  const BAC = toDegrees(Math.acos((A^2 + C^2 - B^2) / (2 * A * C)))
  console.log(ABC," ", BAC)
  return { 
    BAC: BAC > 90 ? false :BAC,
    ABC: ABC >  90 ? false :ABC,
  };
}


// const isIntermediateNode = (lineA, lineB, nodePoint) => {
  
//   // Convert latitude and longitude to radians
//     const lineA_rad = { lat: toRadians(lineA[1]), long: toRadians(lineA[0]) };
//     const lineB_rad = { lat: toRadians(lineB[1]), long: toRadians(lineB[0]) };
//     const nodePoint_rad = { lat: toRadians(nodePoint.lat), long: toRadians(nodePoint.long) };
  
    
//     const distanceAB = calculateDistance(lineA_rad, lineB_rad);
//     const distanceCA = calculateDistance(lineA_rad,nodePoint_rad);
//     const distanceBC = calculateDistance(lineB_rad,nodePoint_rad);

//     // const perpendicularLength  = findPerpendicularLength(distanceAB, distanceBC, distanceCA)
    
//     const perpendicularLength = findPerpendicularLength(lineA_rad, lineB_rad, nodePoint_rad);
//     //const angles = calculateTriangleAngles(lineA_rad, lineB_rad, nodePoint_rad);
//     // if(distanceAB==0){
//     //   console.log(lineA_rad," ",lineB_rad)
//     // }
//     console.log(distanceAB," ",distanceCA," ",distanceBC)
//     const angles = calculateTriangleAngles(distanceAB, distanceBC, distanceCA)

//     if(angles.ABC == false || angles.BAC == false){
//       console.log("IN false")
//       return {
//           distance:  false,
//           intercepted: false,
//         }
//     }
//     else{

//       // console.log('------------------/n'+perpendicularLength*1000)
//       // console.log(distanceCA*1000)
//       // console.log(distanceBC*1000)
//       return {
//         distance: perpendicularLength*1000,
//         intercepted: true,
//         CA:distanceCA*1000,
//         BC:distanceBC*1000
//       }
//     }

//   }
  const toDegrees = (radians) => {
    return radians * (180 / Math.PI);
  };
  const isIntermediateNode =  (lineA, lineB, nodePoint) => {
  
    // Convert latitude and longitude to radians
      const lineA_rad = { lat: toRadians(lineA[1]), long: toRadians(lineA[0]) };
      const lineB_rad = { lat: toRadians(lineB[1]), long: toRadians(lineB[0]) };
      const nodePoint_rad = { lat: toRadians(nodePoint.lat), long: toRadians(nodePoint.long) };
    
      
      const lineDistance = calculateDistance(lineA_rad, lineB_rad);
    
      // Calculate the perpendicular distance from nodePoint to the line defined by lineA and lineB
    
      const perpendicularDistance = lineDistance > 0 ? (calculateDistance(nodePoint_rad, lineA_rad) * calculateDistance(nodePoint_rad, lineB_rad)) / lineDistance : 0;
      
      // Dont delete
      const intersectionPoint = {
        lat: lineA[1] + (lineB[1] - lineA[1]) * (perpendicularDistance / lineDistance),
        long: lineA[0] + (lineB[0] - lineA[0]) * (perpendicularDistance / lineDistance)
      };
      console.log(calculateDistance(nodePoint_rad,intersectionPoint))
      // Check if the intersection point lies between lineA and lineB
      const isInterceptedPerpendicular = perpendicularDistance > 0 && perpendicularDistance <= lineDistance;
      console.log(isInterceptedPerpendicular)
     
      const result = {
        distance: isInterceptedPerpendicular ? perpendicularDistance : false,
        intercepted: isInterceptedPerpendicular
      };
      
      if (result.distance !== false) {
        // console.log(result)
        
        result.distance *= 1000;
        // console.log(result)
        // console.log("--------------------")
      }
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
  


  //x long and y lat
//   const findParallelLines = (dataPoints) =>{
//     const A = dataPoints[0];
//     const B = dataPoints[1];
//     A[0] = toRadians(A[0])
//     A[1] = toRadians(A[1])
//     B[0] = toRadians(B[0])
//     B[1] = toRadians(B[1])
//     console.log(A, ' A')
//     // console.log({lat: toRadians(A[1]), long:toRadians(A[0])}, {lat: toRadians(B[1]), long:toRadians(B[0])})
//     //Calculate distance L:
//     const L = calculateDistance({lat: A[1], long:A[0]}, {lat: B[1], long:B[0]})/2

//     // Calculate the angle of line AB
//     const angle = Math.atan2(B[1] - A[1], B[0] - A[0]);
    

//     // Calculate the perpendicular offset
//     const offset_x = L * Math.sin(angle);
//     const offset_y = L * Math.cos(angle);
  
//     // Calculate the coordinates of the parallel lines
//     const parallel_line_1 = [[A[1] - offset_x, A[0] + offset_y], [B[1] - offset_x, B[0] + offset_y]];
//     const parallel_line_2 = [[A[1] + offset_x, A[0] - offset_y], [B[1] + offset_x, B[0] - offset_y]];
//     parallel_line_1[0] = [toDegrees(parallel_line_1[0][0]), toDegrees(parallel_line_1[0][1])]
//     parallel_line_1[1] = [toDegrees(parallel_line_1[1][0]), toDegrees(parallel_line_1[1][1])]

//     parallel_line_2[0] = [toDegrees(parallel_line_2[0][0]), toDegrees(parallel_line_2[0][1])]
//     parallel_line_2[1] = [toDegrees(parallel_line_2[1][0]), toDegrees(parallel_line_2[1][1])]
//     console.log(parallel_line_1,"s")
//     console.log(parallel_line_2)
//     return [parallel_line_1, parallel_line_2];
// }

module.exports = { getpageCount, hashPassword, getRouteInfo, isIntermediateNode, findParallelLines };

// 37.79103509151187, -122.42789800130387
// 37.74041824562184, -122.46978337728044