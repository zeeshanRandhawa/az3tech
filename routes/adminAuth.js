const bcrypt = require('bcrypt');
const crypto = require('crypto');

const { logDebugInfo } = require('../utilities/logger');
const { queryAll, queryInsertSessionCookie, queryRemoveExpiredSessions, queryRemoveSessionCookie, queryGetRole, queryCreate } = require('../utilities/query');
const { hashPassword } = require('../utilities/utilities');


// authenticate admin endpoint
const userLogin = async (req, res) => {
    try {
        await queryRemoveExpiredSessions(); // remove all cookies from data base that have expired. (Need optimization later we will add trigger on db)

        let loginFormData = req.body;


        // RS
        if (!loginFormData.email) {
            if (req.headers.cookies && (await queryAll('sessions', 'session_token', req.headers.cookies)).data.length > 0) { //check if cookie is present against user
                return res.status(200).json({ message: 'Already Authorized' }); // if present return already auth message
            }
            if (!loginFormData.password || (!loginFormData.userEmail && !loginFormData.email) || (!loginFormData.userEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) && !loginFormData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))) { // else validate password and email
                return res.status(401).json({ message: 'Invalid email or password' }); // if email or password not valid return error
            }
        } //RE
        else { // IS
            if (!loginFormData.password || !loginFormData.email || !loginFormData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { // else validate password and email
                return res.status(401).json({ message: 'Invalid email or password' }); // if email or password not valid return error
            }
        } //IE
        // else {

        // if (!loginFormData.password || !loginFormData.userEmail || !loginFormData.userEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { // else validate password and email
        //     res.status(401).json({ error: 'Invalid email or password' }); // if email or password not valid return error
        // }
        // else {

        //  R/I S
        const userData = await queryAll('users', 'email', loginFormData.userEmail ? loginFormData.userEmail : loginFormData.email); // query user data

        if (userData.status != 200 || userData.data.length == 0) {
            return res.status(401).json({ message: 'Invalid credentials' }); // if no userr found means credentials wrong

        } // R/I E

        if (!loginFormData.email) { // RS
            if (!(['Admin', 'SuperAdmin'].includes((await queryGetRole(session_token = '', email = loginFormData.userEmail)).data[0].role_type.trim()))) {
                return res.status(401).json({ message: 'No Admin exist with above email' }); // if user found but is not admin  means credentials wrong
            }
        } // RE
         else { // IS
            if (['Admin', 'SuperAdmin'].includes((await queryGetRole(session_token = '', email = loginFormData.email)).data[0].role_type.trim())) {
                return res.status(401).json({ message: 'No User exist with above email' }); // if user found but is not admin  means credentials wrong
            }
        } // IE
        // else {
        bcrypt.compare(loginFormData.password, userData.data[0].password, async function (error, result) { // if correct credentials based on email. compare password hash
            if (result) {
                const session_token = await (crypto.randomBytes(32)).toString('hex'); // generate new session cooki (need optimization check for duplicate cookie)
                await res.cookie('admin_cookie', session_token, {
                    maxAge: 3600000,
                    // httpOnly: true, //need to turn these on
                    // secure: true,
                });
                await queryInsertSessionCookie(session_token, loginFormData.userEmail ? loginFormData.userEmail : loginFormData.email); // execute insert cookie query
                res.status(200).json({ message: 'Login successful', 'cookie': session_token }); // return cooki and response
            }
            else {
                res.status(401).json({ message: 'Invalid credential' });
            }
        });
        // }
        // }
        // }
    } catch (error) {
        logDebugInfo('error', 'admin_login', 'users/roles', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

// admin logout endpoint
const adminLogout = async (req, res) => {
    try {
        await queryRemoveExpiredSessions(); // remove expired sesion by iteratively going above each row in query 

        if (req.headers.cookies && (await queryAll('sessions', 'session_token', req.headers.cookies)).data.length > 0) { // if cookie valid and in database
            await queryRemoveSessionCookie(req.headers.cookies); // remove cookie from data base
            res.clearCookie('admin_cookie'); // send res to clear cookie
            res.status(200).json({ message: 'User Loged Out' }); // res message
        }
        else { // else if either cookie not found or not valid still logout for security reasons
            res.clearCookie('admin_cookie'); // send res to clear cookie
            res.status(401).json({ error: 'No User Loged In' });
        }
    } catch (error) {
        logDebugInfo('error', 'admin_logout', 'users/roles', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

// database admin route to check if authenticated
const isLoggedIn = async (req, res) => {
    try {
        res.status(200).json({ "alreadyLoggedIn": await checkIsAuthenticatedSession(req.headers.cookies) })
    } catch (error) {
        logDebugInfo('error', 'is_loggedin_endpoint', 'sessions', error.message, error.stack);
        res.status(500).send("Server Error " + error.message)
    }
}

// get admin role (user, admin, superadmin)
const getRole = async (req, res) => {
    try {
        res.status(200).json({ "currentRole": (await queryGetRole(req.headers.cookies)).data[0].role_type.trim() })
    } catch (error) {
        logDebugInfo('error', 'is_super_admin_endpoint', 'sessions/roles', error.message, error.stack);
        res.status(500).send("Server Error " + error.message)
    }
}

// check if cookie available in database
const checkIsAuthenticatedSession = async (cookie) => {
    try {
        const queryRes = await queryAll('sessions', 'session_token', cookie);
        if (cookie && queryRes.data.length > 0) {
            return true;
        }
        return false;
    } catch (error) {
        logDebugInfo('error', 'is_auth_session_method', 'sessions', error.message, error.stack);
        res.status(500).send("Server Error " + error.message)
    }
}

const userSignUp = async (req, res) => {
    try {
        let siginUpFormData = req.body;
        if (!siginUpFormData || Object.keys(siginUpFormData).length < 6) {
            res.status(400).json({ message: 'Invalid Data' });
        } else if (!siginUpFormData.password || !siginUpFormData.email || !siginUpFormData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { // else validate password and email
            res.status(400).json({ message: 'Invalid email or password' }); // if email or password not valid return error
        } else if ((await queryAll('users', 'email', siginUpFormData.email)).data.length > 0) {
            res.status(400).json({ message: 'Email already exists' });
        } else {
            if (!siginUpFormData.image.includes('data:image/')) {
                if (siginUpFormData.image.startsWith('/9j/')) {
                    siginUpFormData = { ...siginUpFormData, image: 'data:image/jpeg;base64,'.concat(siginUpFormData.image) };
                } else {
                    // if (siginUpFormData.image.startsWith('iVBORw0KGgo')) {
                    siginUpFormData = { ...siginUpFormData, image: 'data:image/png;base64,'.concat(siginUpFormData.image) };
                }
            }
            const queryRes = await queryCreate('users', { email: siginUpFormData.email, password: await hashPassword(siginUpFormData.password), role_id: 3 });
            if (queryRes.status == 200) {
                const riderCreateRes = await queryCreate('riders', { phone_number: siginUpFormData.countryCode.concat(siginUpFormData.mobileNumber), first_name: siginUpFormData.name, profile_picture: siginUpFormData.image, user_id: queryRes.data.lastval });
                if (riderCreateRes.status == 200) {
                    res.status(201).json({ message: "success" })
                }
            } else {
                res.status(queryRes.status).send({ "mesage": "Server Error " + queryRes.data });
            }
        }
    } catch (error) {
        logDebugInfo('error', 'is_auth_session_method', 'sessions', error.message, error.stack);
        res.status(500).send("Server Error " + error.message)
    }

}

module.exports = { userLogin, adminLogout, isLoggedIn, getRole, checkIsAuthenticatedSession, userSignUp };