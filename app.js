const express = require('express'); //main package for server
const cors = require('cors'); // remove this line when deploying toserver
const multer = require('multer'); // used to get and process file stream in batch import request
const upload = multer().any();
const cookieParser = require('cookie-parser');  // set cookies for front end 
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");



const app = express();

app.use(helmet());
app.use(compression());
app.use(cookieParser());
//app.use(express.json());
//app.use(express.json({ limit: '200mb' }));
// app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '500mb', parameterLimit: 50000 }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));


const server = http.createServer(app);

const { userLogin, adminLogout, isLoggedIn, getRole, userSignUp } = require('./routes/adminAuth');
const databaseManagement = require('./routes/databaseManagement');
const { createRiderProfile, searchRiders, patchRider, deleteRider, listRiders, deleteRiderRoute, batchImportRiders, listRiderRoutes, uploadRiderProfilePic, getRRouteTags, filterRRouteByTags, deleteRRouteByTags } = require('./routes/riderAdmin');
const { listDrivers, createDriverProfile, searchDrivers, patchDriver, deleteDriver, deleteDriverRoute, batchImportDrivers, listDriverRoutes, uploadDriverProfilePic, getDRouteTags, filterDRouteByTags, deleteDRouteByTags } = require('./routes/driverAdmin');
const { createRiderRoute, filterRRouteByANodeTW, listRRouteNodes, bulkImportRiderRoutes } = require('./routes/riderRouteAdmin');
const { createDriverRoute, importDriverTransitScheduleRoutes, filterDRouteByDNodeTW, listDRouteNodes } = require('./routes/driverRouteAdmin');
const { getpageCount } = require('./utilities/utilities');
const { isAuthenticated, isAdmin } = require('./routes/middleware');
const NodeAdmin = require('./routes/nodeAdmin')


const nodeAdmin = new NodeAdmin(new Server(server, {
  cors: {
    origin: "*", // Change this to the appropriate origin(s) you want to allow
    methods: ["GET", "POST"] // Specify the HTTP methods you want to allow
  }
}));


app.use(databaseManagement);

app.post('/api/v1/nodes/waypointdistance', isAuthenticated, nodeAdmin.setWayPointDistance);
app.get('/api/v1/nodes/waypointdistance', isAuthenticated, nodeAdmin.getWayPointDistance);

app.post('/api/v1/rider', isAuthenticated, createRiderProfile); // create rider profile
app.post('/api/v1/driver', isAuthenticated, createDriverProfile); // create driver profile

app.get('/api/v1/rider/search', isAuthenticated, searchRiders); // search rider by filter
app.get('/api/v1/driver/search', isAuthenticated, searchDrivers); // search driver by filter

app.patch('/api/v1/rider', isAuthenticated, patchRider); // update rider profile (id and filter list is given)
app.patch('/api/v1/driver', isAuthenticated, patchDriver);// update driver profile (id and filter list is given)

app.delete('/api/v1/rider', isAuthenticated, deleteRider); // delete rider by id
app.delete('/api/v1/driver', isAuthenticated, deleteDriver);// delete driver by id

app.get('/api/v1/rider', isAuthenticated, listRiders);// list riders
app.get('/api/v1/driver', isAuthenticated, listDrivers);// list drivers

app.get('/api/v1/rroutes', isAuthenticated, listRiderRoutes);// list all rider routes
app.get('/api/v1/droutes', isAuthenticated, listDriverRoutes);// list all driver routes

app.get('/api/v1/rider/rroutes', isAuthenticated, listRiderRoutes);// list rider routes based on rider id
app.get('/api/v1/driver/droutes', isAuthenticated, listDriverRoutes);// list driver routes based on driver id

app.get('/api/v1/rroute/node', isAuthenticated, listRRouteNodes);
app.get('/api/v1/droute/node', isAuthenticated, listDRouteNodes);

app.delete('/api/v1/rider/rroutes', isAuthenticated, deleteRiderRoute); // delete rider route by rroute_id
app.delete('/api/v1/driver/droutes', isAuthenticated, deleteDriverRoute);// delete driver route by droute_id

app.post('/api/v1/rider/batchimport', isAuthenticated, upload, batchImportRiders); // batch import riders using csv file
app.post('/api/v1/rroutes/bulkimport', upload, bulkImportRiderRoutes);


app.post('/api/v1/driver/batchimport', isAuthenticated, upload, batchImportDrivers);// batch import drivers using csv file

app.post('/api/v1/rider/route', isAuthenticated, createRiderRoute); // batch import riders using csv file
app.post('/api/v1/driver/route', isAuthenticated, createDriverRoute);// batch import drivers using csv file

app.post('/api/v1/user/login', userLogin);// authenticate admin
app.get('/api/v1/admin/logout', isAuthenticated, adminLogout);// logout admin
app.get('/api/v1/admin/check-login', isLoggedIn);// check if admin is authenticated
app.post('/api/v1/user/signup', userSignUp)

app.get('/api/v1/admin/role', isAuthenticated, getRole);

app.post('/api/v1/rider/upload/profile-pic', isAuthenticated, upload, uploadRiderProfilePic);// Upload Rider Profile Pic
app.post('/api/v1/driver/upload/profile-pic', isAuthenticated, upload, uploadDriverProfilePic);// Upload Driver Profile Pic

app.get('/api/v1/rroutes/tag', isAuthenticated, getRRouteTags); // List Rider Route Tags
app.get('/api/v1/droutes/tag', isAuthenticated, getDRouteTags); // List Driver Route tags

// app.get('/api/v1/rroutes/filter/tag', isAuthenticated, filterRRouteByTags); // List Rider Routes filtered by Tags
// app.get('/api/v1/droutes/filter/tag', isAuthenticated, filterDRouteByTags); // List Driver Routes filtered by Tags

app.delete('/api/v1/rroutes/filter/tag', isAuthenticated, deleteRRouteByTags); // List Rider Routes filtered by Tags
app.delete('/api/v1/droutes/filter/tag', isAuthenticated, deleteDRouteByTags); // List Driver Routes filtered by Tags

app.get('/api/v1/pagecount', isAuthenticated, getpageCount);

app.get('/api/v1/rroutes/filter-ntw', isAuthenticated, filterRRouteByANodeTW);
app.get('/api/v1/droutes/filter-ntw', isAuthenticated, filterDRouteByDNodeTW);

app.post('/api/v1/droutes/transit-import', isAuthenticated, upload, importDriverTransitScheduleRoutes)

app.post('/api/v1/nodes/batch-import', isAuthenticated, upload, nodeAdmin.batchImportNodes);
app.get('/api/v1/nodes/batch/logs/namelist', nodeAdmin.getLogsList);
// app.delete('/api/v1/nodes/batch/log', nodeAdmin.downloadLogFile);
app.get('/api/v1/nodes/batch/log/download', nodeAdmin.downloadLogFile);


app.get('/api/v1/nodes/batch-import/status', isAuthenticated, nodeAdmin.getNode2NodeCalculationStatus); // implement this

app.get('/api/v1/nodes/display', isAuthenticated, nodeAdmin.displayNodesByCoordinate);
app.get('/api/v1/nodes', isAuthenticated, nodeAdmin.getAllNodes)

app.get('/api/v1/nodes/display/two-point', isAuthenticated, nodeAdmin.displayNodesBy2Point);
app.get('/api/v1/nodes/download', isAuthenticated, nodeAdmin.downloadNodesCSV)
app.post('/api/v1/nodes/nearest', nodeAdmin.getNearestNode)

app.get('/api/v1/nodes/states/getsates', nodeAdmin.getAllStates);
app.get('/api/v1/nodes/state/getcitynodes', nodeAdmin.getStateCityNodes);

app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// const port = process.env.PORT;
const port = 4000;
// server listening 
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
