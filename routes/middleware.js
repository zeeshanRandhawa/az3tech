const { queryGetRole } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { checkIsAuthenticatedSession } = require('../routes/adminAuth');

// req.headers.cookies
// req.cookies.admin_cookie


// middle ware to check if user is currnntly authenticated
// receive cookie from user and checks in database
// return 403 if not authenticated
const isAuthenticated = async (req, res, next) => {
  try {
    if (await checkIsAuthenticatedSession(req.headers.cookies)) {
      next();
    } else {
      res.status(403).send('Access denied');
    }
  } catch (error) {
    logDebugInfo('error', 'is_auth_middleware', 'sessions', error.message, error.stack);
    res.status(500).send("Server Error " + error.message);
  }
};


// check if user role is admin or super admin
// if role is not super admin it will return 403
const isSuperAdmin = async (req, res, next) => {
  try {
    if (['SuperAdmin'].includes((await queryGetRole(req.headers.cookies)).data[0].role_type.trim())) {
      next();
    } else {
      res.status(403).send('Only Super Admin can perform this operation');
    }
  } catch (error) {
    logDebugInfo('error', 'is_super_admin_middleware', 'users/roles', error.message, error.stack)
    res.status(500).send("Server Error " + error.message)
  }
};


module.exports = { isAuthenticated, isSuperAdmin };