/*jshint asi: true*/

$(document).ready(function() {

	// parameters for soundcloud
	SOUNDCLOUD_CLIENT_ID = '81d9704f45e2b1d224e791d20eb76d2f'
	SOUNDCLOUD_OAUTH_REDIRECT_URL = 'https://soundcloud-explore.appspot.com/'
	SOUNDCLOUD_CLIENT_SECRET = '4d33c7d194a23e781f184fb2418badae'
	// parameters for testing on local machine
	if (document.domain.indexOf('localhost') != -1) {
		SOUNDCLOUD_CLIENT_ID = 'f90fa65cc94d868d957c0b529c5ecc3d'
		SOUNDCLOUD_OAUTH_REDIRECT_URL = 'http://localhost:16081/'
		SOUNDCLOUD_CLIENT_SECRET = '9a7b216fc0874d85e1f9193f572146ac'
	}

	// CREATE GRAPH OUTPUT

	// input is graph in '->' form, send this to halfviz
	function updateGraph(src_text) {
        var network = parse(src_text)
        $.each(network.nodes, function(nname, ndata){
          if (ndata.label===undefined) ndata.label = nname
        })
        sys.merge(network)
        _updateTimeout = null
        // display text in input area
        $("#halfviz").find('textarea').val(src_text)
	}







	// MANAGE GRAPH DATA

	var finalDegree = 1 // how much data to fetch

	var users = {} // the users that have been processed, indexed by ID
	var sounds = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree

	// a user, local copy of data pulled from Soundcloud
	function User(id, degree, userData) {
		this.id = id
		this.degree = degree // degree of separation from root user in graph

		if (userData) // big object from SC API
			this.userData = userData

		this.queried = {
			'sounds': false,
			'connectedUsers': false
		}

		this.sounds = []
	}

	function Sound(id, sound_obj) {
		this.id = id
		if (sound_obj) this.soundData = sound_obj
		this.connectedUsers = [] // users that have favorited etc this sound

		// add a user that has favorited etc this sound to the list
		this.connectUser = function connectUser(user) {
			if (this.connectedUsers.indexOf(user) == -1)
				this.connectedUsers.push(user)
		}

		// writes source for rendered graph. checks criterion first
		this.writeEdges = function() {
			// check if this edge is to appear in the graph
			if (this.connectedUsers.length<minNodeDegree) return ''
			// write the output
			var output = ''
			var title = this.soundData.title
			$.each(this.connectedUsers, function(index, user) {
				output += user.userData.username + ' -> ' + title + '\n'
			})
			return output
		}
	}

	// check for which users <= degree we haven't queried the sounds
	function loadSoundsAtMaxDegree(degree) {
		var url = 'https://soundcloud-explore.appspot.com/getData'
		// var url = '/getData'
		var soundTypes = ['favorites', 'tracks']
		var user
		var idsToQuery = {}
		var counter = 0
		for (var userId in users) {
			user = users[userId]
			if (!user.queried.sounds && user.degree<=degree) {
				idsToQuery[userId] = soundTypes
				counter +=1
			}
		}
		// call internal API to make SC calls
		var now = new Date()
		$.post(url, {
			'orders' : JSON.stringify(idsToQuery),
			'quick': 'true' // for local testing, only does few requests
		}).done(function(resp) {
			var newDate = new Date()
			console.log('took ' + (newDate - now)+ 'ms to get sounds for ' + counter + ' users.')
			storeSounds(resp, degree)
		})
	}

	// create Sound object for newly found songs, associate sounds with User objects, signal that sounds were loaded
	function storeSounds(soundJSON, degree) {
		var resp = JSON.parse(soundJSON)
		var user, data, soundObj, soundType, soundList, i
		for (var userId in resp) {
			// mark the user as queried
			user = users[userId]
			user.queried.sounds = true
			data = resp[userId]
			// iterate all lists (favorites, tracks)
			for (soundType in data) {
				soundList = JSON.parse(data[soundType])
				console.log(soundType)
				console.log(soundList.length)
				for (i= 0; i<soundList.length; i++) {
					soundObj = soundList[i]
					// create new sound if it doesn't exist
					if (!(soundObj.id in sounds)) {
						sounds[soundObj.id] = new Sound(soundObj.id, soundObj)
					}
					// associate sound object with user and vice versa
					user.sounds.push(sounds[soundObj.id])
					sounds[soundObj.id].connectedUsers.push(user)
				}
			}
			console.log(user.sounds)
		}
	}

	// for which users < degree we haven't queried the followers




	// USER INTERACTIONS etc

	function startWithOAuthUser() {
		// retrive accessToken from LocalStorage
		var accessTokenSC = localStorage.accessTokenSC
		// when redirected form SC oauth dialog
		var oauthCode = getParameterByName('code')
		if (accessTokenSC) {
			// we are authorized
			startWithId('me', accessTokenSC)
		} else if (!accessTokenSC && oauthCode) {
			// get accessToken, then restart
			$.post('https://api.soundcloud.com/oauth2/token', {
				'client_id': SOUNDCLOUD_CLIENT_ID,
				'client_secret': SOUNDCLOUD_CLIENT_SECRET,
				'redirect_uri': SOUNDCLOUD_OAUTH_REDIRECT_URL,
				'grant_type': 'authorization_code',
				'code': oauthCode
			}).fail(function reqFail(data, status, jqXHR) {console.log(data)})
			.done(function reqDone(data, status, jqXHR) {
				// store token and start again
				if (typeof(data) == 'object' && 'access_token' in data) {
					localStorage.accessTokenSC = data['access_token']
					startWithOAuthUser()
				} else {console.log(data)}
			})
			// remove code from displayed url
			var url = location.protocol+'//'+location.hostname+
				(location.port ? ':'+location.port: '')+'/'
			history.pushState({id: 'oauth_code'}, '', url);
		} else {
			// splashpage prompt user to authorize on SC
			location.href = '/splashpage'
		}
	}

	function logVisit(userJSON) {
		$.post('/log', userJSON)
	}

	// get a URL query paramter. used to extract oauth code
	function getParameterByName(name) {
		// name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
			results = regex.exec(location.search);
		return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

	function startWithId(id, accessTokenSC) {
		var url = 'https://api.soundcloud.com/users/'+id+
		'.json?client_id='+SOUNDCLOUD_CLIENT_ID
		if (id == 'me' && accessTokenSC) {
			url = "https://api.soundcloud.com/me.json?oauth_token=" + accessTokenSC
		}
		$.getJSON(url).done(function(user) {
			console.log("Start graph search for user " + user.username)
			rootID = user.id
			users[rootID] = new User(rootID, 0, user)
			// start traveling down the tree
			loadSoundsAtMaxDegree(0)
			// log this visit on backend
			logVisit(user)
		})
	}

	function start() {
		if (location.pathname.length > 1) {
			// if path is something like "/pfalke", start with user 'pfalke'
			var pathArray = window.location.pathname.split( '/' )
			var id = (pathArray[0] === '') ? pathArray[1] : pathArray[0]
			console.log('guessing user id is ' +id)
			startWithId(id)
		} else {
			startWithOAuthUser()
			console.log('going with oauth')
		}
	}





	// START HERE

	// display "Loading"
    var mcp = HalfViz("#halfviz")
    updateGraph('Loading -> Your Data \n Your Data -> This can take \n This can take -> a few minutes')
	// resize window to trigger the start of rendering
	setTimeout(function() {	$(window).resize()},500)
	setTimeout(function() {	$(window).resize()},1500)
	setTimeout(function() {	$(window).resize()},3500)
	setTimeout(function() {	$(window).resize()},7500)

	start()

	// startWithId('emeli-st-rmer')
	// emeli-st-rmer
	// eleonore-van-roosendaal

})