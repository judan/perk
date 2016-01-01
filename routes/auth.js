let express = require('express');
let router = express.Router();
let config = require('../lib/config');
let passport = require('passport');
let validator = require('validator');
let bcrypt = require('bcrypt');
let validateAuthType = require('../lib/middleware/validate-auth-type');
let validateAuthProfile = require('../lib/middleware/validate-auth-profile');
let validateLocalCredentials = require('../lib/middleware/validate-local-credentials');
let authenticator = require('../lib/auth/authenticator');
let AuthenticationModel = require('../models/Authentication');
let UserModel = require('../models/User');


router.use('/:type/login', validateAuthType, function(req, res, next) {
	passport.authenticate(
		req.params.type,
		{
			scope: config.auth[req.params.type].scope || []
		}
	)(req, res, next);
});

router.get('/:type/callback', validateAuthType, function(req, res, next) {
	passport.authenticate(
		req.params.type,
		{ 
			successRedirect: '/auth/'+req.params.type+'/success',
			failureRedirect: '/auth/'+req.params.type+'/failure'
		}
	)(req, res, next);
});

router.get('/:type/register', function(req, res, next) {

});

router.get('/email', validateAuthProfile, function(req, res) {
	if(!req.session.hasOwnProperty('_auth_profile')) {
		return res.redirect('/auth/error');
	}
	if(req.session._auth_profile.email) {
		return res.redirect('/auth/finish');
	}
	res.render('auth/email');
});

router.post('/email', validateAuthProfile, function(req, res, next) {
	if(!req.body.email) {
		req.flash('email', 'Please enter your email address');
	}
	if(!validator.isEmail(req.body.email)) {
		req.flash('email', 'It looks like there\'s somthing wrong with that email address');
	}
	if(req.session._flash_messages.email) {
		return res.redirect('/auth/email');
	}
	req.session._auth_profile.email = req.body.email;
	authenticator(req, req.session._auth_access_token, req.session._auth_profile, req.session._auth_type, function(err, authModel) {
		console.log(err, authModel);
	});

});

router.get('/register', function(req, res, next) {
	res.render('auth/register');
});

router.get('/login', function(req, res, next) {
	res.render('auth/login');
});

router.post('/register', validateLocalCredentials, function(req, res, next) {
	UserModel
	.forge({email: req.body.email})
	.fetch()
	.then(function(u) {
		// The account already exists, return an error.
		if(u) {
			res.error.add('auth.EMAIL_EXISTS', 'email');
			res.error.send('/auth/register');
			// res.error(
			// 	'A user with that email has already registered. Would you like to <a href="/auth/reset-password">reset your password</a>?',
			// 	400,
			// 	'email',
			// 	'/auth/register'
			// );
		}
		// The account doesn't exists. Create it.
		else {
			bookshelf.transaction(function(t) {
				let newUser = new UserModel({
					firstName: req.body.firstName,
					lastName: req.body.lastName,
					email: req.body.email
				});
				newUser.save(null, {transacting: t})
				.then(function(user) {
					return new Promise(function(resolve, reject) {
						bcrypt.genSalt(config.auth.local.saltRounds, function(err, salt) {
							bcrypt.hash(req.body.password, salt, function(err, hash) {
								if(err) {
									reject(err);
								}
								else {
									AuthenticationModel.forge({
										type: 'local',
										identifier: req.body.email,
										password: hash,
										userId: user.id
									})
									.save(null, {transacting: t})
									.then(resolve)
									.catch(reject);
								}
							});
						});
					});
				})
				.then(t.commit)
				.then(function() {
					if(req.accepts('html')) {
						res.redirect(config.auth.local.registerRedirect || '/auth/finish');
					}
					else {
						res.json(newUser.toJSON());
					}
				})
				.catch(function(err) {
					t.rollback();
					res.error.add('auth.UNKNOWN');
					res.error.send('/auth/register');
					// res.error(
					// 	err.toString(),
					// 	500,
					// 	'email',
					// 	'/auth/register'
					// );
				});
			});
		}
	});
});

router.post('/login', validateLocalCredentials, function(req, res, next) {
	AuthenticationModel.forge({
		type: 'local',
		identifier: req.body.email
	})
	.fetch({withRelated: ['user']})
	.then(function(auth) {
		if(!auth) {
			res.error.add('auth.UNKNOWN_USER', 'email');
			res.error.send('/auth/login');
			// res.error(
			// 	'There is no user with that email. Would you like to <a href="/auth/register">register</a>?',
			// 	404,
			// 	'email',
			// 	'/auth/login'
			// );
		}
		else {
			bcrypt.compare(req.body.password, auth.get('password'), function(err, result) {
				if(err) {
					res.error.add('auth.UNKNOWN');
					res.error.send('/auth/login');
					// res.error(
					// 	err.toString(),
					// 	500,
					// 	'email',
					// 	'/auth/login'
					// );
				}
				else if(!result) {
					res.error.add('auth.INVALID_PASSWORD', 'password');
					res.error.send('/auth/login');
					// res.error(
					// 	'That password is not correct.',
					// 	400,
					// 	'password',
					// 	'/auth/login'
					// );
				}
				else {
					if(req.accepts('html')) {
						res.redirect(config.auth.local.loginRedirect || '/auth/finish');
					}
					else {
						res.json();
					}
				}
			});
		}
	});
});

router.get('/finish', function(req, res, next) {

});

module.exports = router;
