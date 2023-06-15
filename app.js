const express = require('express'); //main package for server
const cors = require('cors'); // remove this line when deploying toserver
const multer = require('multer'); // used to get and process file stream in batch import request
const upload = multer().any();
const cookieParser = require('cookie-parser');  // set cookies for front end 
// const http = require('http');
const path = require('path');
// const { Server } = require("socket.io");



const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
// app.use(express.raw({ type: '*/*', limit: '100mb' }));



const { logToPostgres } = require('./utilities/logger');
// const { readCSVFile, appendDataToCSVFile, updateCSVFile } = require('./fileReader');
// const { distanceDurationBetweenAllNodes } = require('./n2n');
const { userLogin, adminLogout, isLoggedIn, getRole, userSignUp } = require('./routes/adminAuth');
// const { getAllTablesStats, purgeSelected, purgeByFilter } = require('./routes/databaseManagement');
const databaseManagement = require('./routes/databaseManagement');
const { createRiderProfile, searchRiders, patchRider, deleteRider, listRiders, deleteRiderRoute, batchImportRiders, listRiderRoutes, uploadRiderProfilePic, getRRouteTags, filterRRouteByTags, deleteRRouteByTags } = require('./routes/riderAdmin');
const { listDrivers, createDriverProfile, searchDrivers, patchDriver, deleteDriver, deleteDriverRoute, batchImportDrivers, listDriverRoutes, uploadDriverProfilePic, getDRouteTags, filterDRouteByTags, deleteDRouteByTags } = require('./routes/driverAdmin');
const { createRiderRoute, filterRRouteByANodeTW, listRRouteNodes } = require('./routes/riderRouteAdmin');
const { batchImportNodes, displayNodesByCoordinate, displayNodesBy2Point } = require('./routes/nodeAdmin');
const { createDriverRoute, importDriverTransitScheduleRoutes, filterDRouteByDNodeTW, listDRouteNodes } = require('./routes/driverRouteAdmin');
const { getpageCount } = require('./utilities/utilities');
const { isAuthenticated, isSuperAdmin } = require('./routes/middleware');
// const { socketListen } = require('./utilities/socket');





// app.get('/api/v1/table-stats', isAuthenticated, getAllTablesStats); //list table meta data (name, rowCount, usage)
// app.post('/api/v1/purge-tables', isAuthenticated, isSuperAdmin, purgeSelected); // purge/drop selected table

// app.post('/api/v1/truncate/selected-filter', isAuthenticated, isSuperAdmin, purgeByFilter); // purge rider/driver table based on filter list
app.use(databaseManagement);


app.post('/api/v1/rider', isAuthenticated, createRiderProfile); // create rider profile
app.post('/api/v1/driver', isAuthenticated, createDriverProfile); // create driver profile

app.get('/api/v1/rider/search', isAuthenticated, searchRiders); // search rider by filter
app.get('/api/v1/driver/search', isAuthenticated, searchDrivers); // search driver by filter

app.patch('/api/v1/rider', isAuthenticated, isSuperAdmin, patchRider); // update rider profile (id and filter list is given)
app.patch('/api/v1/driver', isAuthenticated, isSuperAdmin, patchDriver);// update driver profile (id and filter list is given)

app.delete('/api/v1/rider', isAuthenticated, isSuperAdmin, deleteRider); // delete rider by id
app.delete('/api/v1/driver', isAuthenticated, isSuperAdmin, deleteDriver);// delete driver by id

app.get('/api/v1/rider', isAuthenticated, listRiders);// list riders
app.get('/api/v1/driver', isAuthenticated, listDrivers);// list drivers

app.get('/api/v1/rroutes', isAuthenticated, listRiderRoutes);// list all rider routes
app.get('/api/v1/droutes', isAuthenticated, listDriverRoutes);// list all driver routes

app.get('/api/v1/rider/rroutes', isAuthenticated, listRiderRoutes);// list rider routes based on rider id
app.get('/api/v1/driver/droutes', isAuthenticated, listDriverRoutes);// list driver routes based on driver id

app.get('/api/v1/rroute/node', isAuthenticated, listRRouteNodes);
app.get('/api/v1/droute/node', isAuthenticated, listDRouteNodes);

app.delete('/api/v1/rider/rroutes', isAuthenticated, isSuperAdmin, deleteRiderRoute); // delete rider route by rroute_id
app.delete('/api/v1/driver/droutes', isAuthenticated, isSuperAdmin, deleteDriverRoute);// delete driver route by droute_id

app.post('/api/v1/rider/batchimport', isAuthenticated, isSuperAdmin, upload, batchImportRiders); // batch import riders using csv file
app.post('/api/v1/driver/batchimport', isAuthenticated, isSuperAdmin, upload, batchImportDrivers);// batch import drivers using csv file

app.post('/api/v1/rider/route', isAuthenticated, isSuperAdmin, createRiderRoute); // batch import riders using csv file
app.post('/api/v1/driver/route', isAuthenticated, isSuperAdmin, createDriverRoute);// batch import drivers using csv file

app.post('/api/v1/user/login', userLogin);// authenticate admin
app.get('/api/v1/admin/logout', isAuthenticated, adminLogout);// logout admin
app.get('/api/v1/admin/check-login', isLoggedIn);// check if admin is authenticated
app.post('/api/v1/user/signup', userSignUp)

app.get('/api/v1/admin/role', isAuthenticated, getRole);

app.post('/api/v1/rider/upload/profile-pic', isAuthenticated, isSuperAdmin, upload, uploadRiderProfilePic);// Upload Rider Profile Pic
app.post('/api/v1/driver/upload/profile-pic', isAuthenticated, isSuperAdmin, upload, uploadDriverProfilePic);// Upload Driver Profile Pic

app.get('/api/v1/rroutes/tag', isAuthenticated, getRRouteTags); // List Rider Route Tags
app.get('/api/v1/droutes/tag', isAuthenticated, getDRouteTags); // List Driver Route tags


// app.get('/api/v1/rroutes/filter/tag', isAuthenticated, filterRRouteByTags); // List Rider Routes filtered by Tags
// app.get('/api/v1/droutes/filter/tag', isAuthenticated, filterDRouteByTags); // List Driver Routes filtered by Tags


app.delete('/api/v1/rroutes/filter/tag', isAuthenticated, isSuperAdmin, deleteRRouteByTags); // List Rider Routes filtered by Tags
app.delete('/api/v1/droutes/filter/tag', isAuthenticated, isSuperAdmin, deleteDRouteByTags); // List Driver Routes filtered by Tags


app.get('/api/v1/pagecount', isAuthenticated, getpageCount);

app.get('/api/v1/rroutes/filter-ntw', isAuthenticated, filterRRouteByANodeTW);
app.get('/api/v1/droutes/filter-ntw', isAuthenticated, filterDRouteByDNodeTW);

app.post('/api/v1/droutes/transit-import', isAuthenticated, isSuperAdmin, upload, importDriverTransitScheduleRoutes)

app.post('/api/v1/nodes/batch-import', upload, batchImportNodes)  // in process

app.get('/api/v1/nodes/display', displayNodesByCoordinate);




app.get('/api/v1/nodes/display/two-point', displayNodesBy2Point);



app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// const port = process.env.PORT;
const port = 4000;
// server listening 
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
