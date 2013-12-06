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

	var dataUrl = 'https://soundcloud-explore.appspot.com/getData'
	// var dataUrl = '/getData'





	// CREATE GRAPH OUTPUT
	var minConnectedUsers = 8 // how many connected users a sound needs to have to be relevant/displayed
	var minRelevantSounds = 3 // how many relevant sounds a user needs to be connected to to be displayed

	// user choices
	var degreeConsidered = 1 // selected by explorer: users up to this degree are considered
	$('.degreeButton').click(function(el) {
		degreeConsidered = $(this).attr('degree')
		determineGraphNodes()

		// color buttons
		$('.degreeButton').each(function(i, btn) {
			if (!($(btn).attr("disabled"))) {
				$(btn).removeClass('btn-primary').addClass('btn-warning')
			}
		})
		$(this).removeClass('btn-warning').addClass('btn-primary')
	})

	// true: display only sounds that are not connected to root user
	var keepFresh = false
	$('#keepFresh').change(function() {
		keepFresh = ($(this).attr('checked') == 'checked')
		determineGraphNodes()
	})

	// true: display only users that are not connected to root user
	var newPeople = false
	$('#newPeople').change(function() {
		newPeople = ($(this).attr('checked') == 'checked')
		determineGraphNodes()
	})

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

	// prepare graph as string: [user] -> [sound]
	function writeGraphSrc(soundList, userCounts) {
		// write edges
		var graphSrc = ''
		$.each(soundList, function(index, sound) {
			// check which users to connect to the node
			$.each(sound.connectedUsersAtDegree(degreeConsidered), function(i, user) {
				graphSrc += sound.soundData.title + ' {color:#f60}\n' // sound nodes have orange background
				if (userCounts[user.userData.id]>= minRelevantSounds) {
					graphSrc += user.userData.username + ' -> ' + sound.soundData.title + '\n'
				}
			})
		})

		// pass the source to the parser
		updateGraph(graphSrc)
	}

	// returns list of sounds to be included in graph and dict giving how many of these sounds each user is connecteed to
	var determineGraphNodes = function() {
		var now = new Date()
		// check how often each user appers - don't want users that appear only once
		var soundsInGraph
		var userCounts
		var bumpUserCount = function(index, user) {
			var id =user.userData.id
			if (id in userCounts) {
				userCounts[id] +=1
			} else {
				userCounts[id] = 1
			}
		}

		// get sounds that have high enough degree for the graph
		function getSoundsForGraphAndUserCounts() {
			soundsInGraph = []
			userCounts = {}
			for (var soundId in sounds) {
				// criteria for inclusion of sound:
				// (if keepFresh only sounds not connected to root user)
				// sound needs to have enough connected users below degreeConsidered
				if ((!keepFresh || users[rootID].sounds.indexOf(sounds[soundId])== -1) &&
					sounds[soundId].connectedUsersAtDegree(degreeConsidered).length>=minConnectedUsers) {
					soundsInGraph.push(sounds[soundId])
					// console.log(sounds[soundId].soundData.title)
					// bump count for each user associated with sound
					$.each(sounds[soundId].connectedUsersAtDegree(degreeConsidered), bumpUserCount)
				}
			}
		}

		getSoundsForGraphAndUserCounts()

		// there should be 5-15 sounds in the graph. adjust parameters as long as it makes sense
		while (soundsInGraph.length> 15 && minConnectedUsers<25) {
			minConnectedUsers +=1
			console.log('increased nodeDegree to '+ minConnectedUsers +
				', had ' + soundsInGraph.length + ' sounds')
			getSoundsForGraphAndUserCounts()
		}
		while (soundsInGraph.length< 5 && minConnectedUsers>3) {
			minConnectedUsers -=1
			console.log('decreased nodeDegree to '+ minConnectedUsers +
				', had ' + soundsInGraph.length + ' sounds')
			getSoundsForGraphAndUserCounts()
		}

		// if active, no users followed by root user are displayed. Therefore make their userCounts 0
		if (newPeople) {
			for (var j=0; j<users[rootID].followings.length; j++) {
				userCounts[users[rootID].followings[j].id] = 0
			}
		}
	
		// there should be 5-15 users in the graph. adjust parameters as long as it makes sense
		var bigUsers
		var computeNumerBigUsers = function() {
			bigUsers = 0
			for (var i in userCounts) {
				// criteria for user to be displayed:
				// connected to enough relevant sound and (if active) not followed by root user
				// (!newPeople || users[rootID].followings.indexOf(users[i]) == -1)
				if (userCounts[i]>minRelevantSounds) {bigUsers+=1}
			}
		}
		computeNumerBigUsers()
		while (bigUsers<5 && minRelevantSounds>1) {
			minRelevantSounds -=1
			computeNumerBigUsers()
		}
		while (bigUsers>8 && minRelevantSounds<15) {
			minRelevantSounds +=1
			computeNumerBigUsers()
		}

		writeGraphSrc(soundsInGraph, userCounts)
		// update again in .5 sec
		// setTimeout(writeGraphSource, 800)
		var then = new Date()
		console.log('took ' + (then-now) + 'ms to determine graph with ' + soundsInGraph.length + ' sounds')
	}











	// MANAGE GRAPH DATA

	var finalDegree = 4 // how much data to fetch (degrees of separation from root user)

	var users = {} // the users that have been processed, indexed by ID
	var sounds = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree

	var dataTypes = {
		'connectedUsers': ['followings'],
		'sounds': ['favorites', 'tracks']
	}

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

		this.sounds = [] // favorites, tracks, etc
		this.followers = []
		this.followings = []

		this.coolSounds = [] // sounds in common with root user
	}

	function Sound(id, sound_obj) {
		this.id = id
		if (sound_obj) this.soundData = sound_obj
		this.connectedUsers = {
			'0': [], // users at degree ... that have favorited etc this sound
			'1': [],
			'2': [],
			'3': [],
			'4': [],
		}

		// returns list of users up to given degree have favorited etc this sound
		this.connectedUsersAtDegree = function(degree) {
			var connectedUsers = []
			for (var i=0; i<=degree; i++) {
				connectedUsers = connectedUsers.concat(this.connectedUsers[i])
			}
			return connectedUsers
		}
	}

	// create Sound object for newly found songs, associate sounds with User objects, signal that sounds were loaded
	function storeSounds(soundJSON, degree) {
		var now = new Date()
		var resp = JSON.parse(soundJSON)
		var user, data, soundObj, soundType, soundList, i
		for (var userId in resp) {
			// mark the user as queried
			user = users[userId]
			user.queried.sounds = true
			data = resp[userId]
			// iterate all lists (favorites, tracks)
			for (soundType in data) {
				soundList = JSON.parse(data[soundType])// data[soundType] // 
				for (i= 0; i<soundList.length; i++) {
					soundObj = soundList[i]
					// create new sound if it doesn't exist
					if (!(soundObj.id in sounds)) {
						sounds[soundObj.id] = new Sound(soundObj.id, soundObj)
					} else {
						// console.log('sound exists')
					}
					// associate sound object with user and vice versa
					user.sounds.push(sounds[soundObj.id])
					sounds[soundObj.id].connectedUsers[degree].push(user)

					// sounds in common with root user are cool
					if (users[rootID].sounds.indexOf(sounds[soundObj.id])>=0) {
						user.coolSounds.push(sounds[soundObj.id])
					}
				}
			}
		}
		// enable button for this degree to allow user to look at data
		if (degree>1) {
			$('#btnDegree'+degree).addClass('btn-warning').removeAttr('disabled')
		}

		// start retrieving connectedUsers unless we reached finalDegree
		if (degree<finalDegree) {
			loadDataAtMaxDegree('connectedUsers' ,degree)
		}

		var then = new Date()
		// console.log('took ' + (then-now) + 'ms to store sounds')
		// rewrite graph
		determineGraphNodes()
	}

	// create User object for newly found users, associate users amongst each other, signal that users were loaded
	function storeConnections(usersJSON, degree) {
		var now = new Date()
		var resp = JSON.parse(usersJSON)
		var userId, user, data, dataObj, dataType, dataList, i, otherType
		for (userId in resp) {
			// mark the user as queried, delete references that were made so far to avoid duplicates
			user = users[userId]
			user.queried.connectedUsers = true
			user.followings = []
			user.followers = []
			data = resp[userId]
			// iterate all lists (favorites, tracks)
			for (dataType in data) {
				otherType = (dataType == 'followers') ? 'followings' : 'followers'
				dataList = JSON.parse(data[dataType]) // data[dataType] // 
				for (i= 0; i<dataList.length; i++) {
					dataObj = dataList[i]
					// create new user if it doesn't exist
					if (!(dataObj.id in users)) {
						users[dataObj.id] = new User(dataObj.id, degree+1, dataObj)
					}
					// associate users with each other
					user[dataType].push(users[dataObj.id])
					users[dataObj.id][otherType].push(user)
				}
			}
		}
		var then = new Date()
		// console.log('took ' + (then-now) + 'ms to store connections')

		// start retrieving sounds unless we reached finalDegree
		loadDataAtMaxDegree('sounds' ,degree+1)
	}

	// for which users <= degree we haven't queried this dataType
	function loadDataAtMaxDegree(dataType, degree) {
		var user
		var idsToQuery = {}
		var counter = 0
		for (var userId in users) {
			user = users[userId]
			// check if degree OK and we have not queried this data for this user before
			// check connected users only if user has enough cool sounds (more than his degree)
			if (!user.queried[dataType] && user.degree<=degree &&
				(dataType == 'sounds' || user.coolSounds.length>user.degree)) {
				idsToQuery[userId] = dataTypes[dataType]
				counter +=1
			}
		}
		console.log('get '+ dataType + ' for ' + counter + ' users.')
		// call internal API to make SC calls
		var now = new Date()
		$.post(dataUrl, {
			'orders' : JSON.stringify(idsToQuery),
			'quicks': 'x' // parameter "quick": for local testing, backend only does few requests
		}).done(function(resp) {
			var newDate = new Date()
			console.log('took ' + (newDate - now)+ 'ms to get ' + dataType +
				' for ' + counter + ' users at degree ' + degree + '.')
			// process response
			if (dataType == 'sounds') {storeSounds(resp, degree)}
			else if (dataType == 'connectedUsers') {storeConnections(resp, degree)}
		})

	}










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
		$.post('/log',userJSON)
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
			// loadSoundsAtMaxDegree(0)
			loadDataAtMaxDegree('sounds', 0)
			// log this visit on backend
			logVisit(user)
		})
		// show button for Connect to Soundcloud if not connected
		if (!localStorage.accessTokenSC) {
			console.log(localStorage.accessTokenSC)
			$('#oauth_button').show()
		}
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

	// engineering
	try {
		if (window.chrome.loadTimes().wasFetchedViaSpdy) {
			console.log('loaded via SPDY')
		} else {
			console.log('no SPDY')
		}
	} catch(e) {
		console.log(e)
	}

	// startWithId('emeli-st-rmer')
	// emeli-st-rmer
	// eleonore-van-roosendaal

})