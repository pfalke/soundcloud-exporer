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

	// count how many users have been processed
	var maxDegree = 3
	var minNodeDegree = 8
	var minUserDegree = 3

	// parser for halfviz
	var parse = Parseur().parse

	var users = {} // the users that have been processed, indexed by ID
	var sounds = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree
	var edges = [] // edges to be drawn in the graph. these also define the nodes

	// a user, local copy of data pulled from Soundcloud
	function User(id, userData) {
		this.id = id
		if (userData)
			this.userData = userData

		this.favorites = []
		this.tracks = []
		this.playlisttracks = []

		this.queried = {
			'followers': false,
			'followings': false,
			'favorites': false,
			'playlists': false,
			'tracks': false,
			'sounds': false,
			'connectedUsers': false
		}

		this.iteratedSounds = false

		this.getSounds = function getSounds() {
			var sounds = this.favorites.concat(this.playlisttracks).concat(this.tracks)
			return sounds
		}
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

	// writes the source file for the graph and passes it to the parser
	var writeGraphSource = function() {
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
				if (sounds[soundId].connectedUsers.length>=minNodeDegree) {
					soundsInGraph.push(sounds[soundId])
					// bump count for each user associated with sound
					$.each(sounds[soundId].connectedUsers, bumpUserCount)
				}
			}
		}

		getSoundsForGraphAndUserCounts()

		// there should be 5-15 sounds in the graph. adjust parameters as long as it makes sense
		while (soundsInGraph.length> 15 && minNodeDegree<25) {
			minNodeDegree +=1
			console.log('increased nodeDegree to '+ minNodeDegree +
				', had ' + soundsInGraph.length + ' sounds')
			getSoundsForGraphAndUserCounts()
		}
		while (soundsInGraph.length< 5 && minNodeDegree>3) {
			minNodeDegree -=1
			console.log('decreased nodeDegree to '+ minNodeDegree +
				', had ' + soundsInGraph.length + ' sounds')
			getSoundsForGraphAndUserCounts()
		}

		// there should be 5-15 users in the graph. adjust parameters as long as it makes sense
		var bigUsers
		var computeNumerBigUsers = function() {
			bigUsers = 0
			for (var i in userCounts) {
				if (userCounts[i]>minUserDegree) {bigUsers+=1}
			}
		}
		computeNumerBigUsers()
		while (bigUsers<5 && minUserDegree>1) {
			minUserDegree -=1
			computeNumerBigUsers()
		}
		while (bigUsers>15 && minUserDegree<15) {
			minUserDegree +=1
			computeNumerBigUsers()
		}

		// write edges
		graphSrc = ''
		$.each(soundsInGraph, function(index, sound) {
			// node for the sound
			// graphSrc += sound.soundData.title + '\n'
			// check which users to connect to the node
			$.each(sound.connectedUsers, function(i, user) {
				if (userCounts[user.userData.id]>= minUserDegree) {
					graphSrc += user.userData.username + ' -> ' + sound.soundData.title + '\n'
				}
			})
		})

		// pass the source to the parser
		if (graphSrc.length > 0) updateGraph(graphSrc)

		// update again in .5 sec
		setTimeout(writeGraphSource, 800)
		// use updated variables next time

	}

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

	// get all favorites, playlist tracks, tracks for a user from soundcloud API
	function querySounds(id, degree, callback) {
		var user = users[id]
		user.favorites = []
		$.getJSON('https://api.soundcloud.com/users/'+id+
		'/favorites.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(favorites) {
			// process favorites
			for (var i = 0; i < favorites.length; i++) {
				var track = favorites[i]
				// associate sound with user
				user.favorites.push(track.id)
				// store track if not done already
				if (!(track.id in sounds)) {
					sounds[track.id] = new Sound(track.id, track)
				}
				// associate user with sounds
				sounds[track.id].connectUser(user)

				// check new data allows to include the sound into the graph
				// checkGraphInclusion(track.id)
			}

			user.queried.sounds = true

			// proceed algorithm with callback
			if (callback) callback(id, degree)
			
		})
	}

	// get all followings, followers for a user from soundcloud API
	function queryConnectedUsers(id, degree, callback) {
		var user = users[id]
		user.connectedUsers = []
		$.each(['followings', 'followers'], function(index, set) {
			user[set] = []
			// get data
			$.getJSON('https://api.soundcloud.com/users/'+id+'/'+set+
			'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(listOfUsers) {
				$.each(listOfUsers, function(i, userData) {
					// store user if not already in users dict
					if (!(userData.id in users))
						users[userData.id] = new User(userData.id, userData)
					// associate found user with current user
					if (user.connectedUsers.indexOf(userData.id) == -1)
						user.connectedUsers.push(userData.id)
					user[set].push(userData.id)
				})

				user.queried[set] = true

				// check if this is the last API call for this user
				if (user.queried.followers && user.queried.followings) {
					user.queried.connectedUsers = true
					// proceed algorithm with callback
					if (callback) callback(id, degree)
				}
			})
		})
	}



	// checks which sounds a user has in common with the root user
	// decides whether to display the user and whether to iterate connected users
	function iterateSounds(id, degree) {
		var user = users[id]
		// check if we need to load the data first. querySounds calls iterateSounds again when finished
		if (!user.queried.sounds) {
			querySounds(id, degree, iterateSounds)
			return
		} else if (user.iteratedSounds) {
			// the user has been iterated before
			return
		}

		// process all sounds connected to the user, i.e. favorites, tracks, playlists
		// console.log("iterating sounds for " + id)
		var sounds = user.getSounds()
		var rootSounds = users[rootID].getSounds()
		var commonSounds = 0
		$.each(sounds, function(soundIndex, soundID) {
			if (rootSounds.indexOf(soundID) != -1) commonSounds +=1
		})
		// console.log('User ' + id + ' has ' + commonSounds + ' common sounds (of '+ sounds.length+
		// ') with root user (' + rootSounds.length + '). Degree ' +
		// degree)

		// flag the user not to be iterated again
		user.iteratedSounds = true

		// if user has enough common sounds with root user, proceed with her followers etc
		if (commonSounds - degree >0 || id == rootID) {
			if (degree < maxDegree) {
				console.log('get followings')
				iterateConnectedUsers(id, degree+1)
			}
			else {
				console.log('no follow up, degree too high')
			}
		}
	}

	// iterate over all followers and followings of a user
	function iterateConnectedUsers(id, degree) {
		var user = users[id]
		// check if we need to load the data first.
		// queryConnectedUsers calls iterateSounds again when finished
		if (!user.queried.connectedUsers) {
			queryConnectedUsers(id, degree, iterateConnectedUsers)
			return
		}
		// console.log('iterating '+ user.connectedUsers.length+' connectedUsers for ' + id)

		// process all users connected to the user, i.e. followers, followings
		var connectedUsers = user.connectedUsers
		$.each(connectedUsers, function(index, userId) {
			iterateSounds(userId, degree)
		})
	}

	function logVisit(userJSON) {
		$.post('/log', userJSON)
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
			users[rootID] = new User(rootID, user)
			// start traveling down the tree
			iterateSounds(rootID,0)
			// log this visit on backend
			logVisit(user)
		})
	}

	// get a URL query paramter. used to extract oauth code
	function getParameterByName(name) {
		// name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
			results = regex.exec(location.search);
		return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

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


	// START HERE


	// display "Loading"
    var mcp = HalfViz("#halfviz")
    updateGraph('Loading -> Your Data \n Your Data -> This can take \n This can take -> a few minutes')
	// resize window to trigger the start of rendering
	setTimeout(function() {	$(window).resize()},500)
	setTimeout(function() {	$(window).resize()},1500)
	setTimeout(function() {	$(window).resize()},3500)
	setTimeout(function() {	$(window).resize()},7500)
	writeGraphSource()

	startWithOAuthUser()
	// startWithId('emeli-st-rmer')
	// emeli-st-rmer
	// eleonore-van-roosendaal

})