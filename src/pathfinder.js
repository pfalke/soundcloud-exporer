/*jshint asi: true*/

$(document).ready(function() {



	// count how many users have been processed
	var maxDegree = 3
	var minNodeDegree = 12
	var minUserDegree = 3

	// parser for halfviz
	var parse = Parseur().parse

	var users = {}
	var sounds = {}
	var usersProcessed = {} // the users that have been processed, indexed by ID
	// for each user, list of followers, list of followings, list of tracks and queried resources are stored
	var tracksSighted = {} // the tracks that have been sighted, indexed by ID
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
		userCounts = {}
		function bumpUserCount(index, user) {
			var id =user.userData.id
			if (id in userCounts) {
				userCounts[id] +=1
			} else {
				userCounts[id] = 1
			}
		}

		// get sounds that have high enough degree for the graph
		soundsInGraph = []
		for (var soundId in sounds) {
			if (sounds[soundId].connectedUsers.length>=minNodeDegree) {
				soundsInGraph.push(sounds[soundId])
				// bump count for each user associated with sound
				$.each(sounds[soundId].connectedUsers, bumpUserCount)
			}
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
		setTimeout(writeGraphSource, 3000)
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
		$.getJSON('http://api.soundcloud.com/users/'+id+
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
			$.getJSON('http://api.soundcloud.com/users/'+id+'/'+set+
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
		// check if we need to load the data first. queryConnectedUsers calls iterateSounds again when finished
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

	function startWithOAuth() {
		// connect to Soundcloud
		SC.initialize({
			client_id: SOUNDCLOUD_CLIENT_ID,
			redirect_uri: SOUNDCLOUD_OAUTH_REDIRECT_URL,
		});
		SC.connect(function(){
			SC.get("/me.json", function(user, error){
				if(error){
					console.log("Error: " + error.message)
				}else{
					console.log("Start graph search for user " + user.username)
					rootID = user.id
					users[rootID] = new User(rootID, user)
					// start traveling down the tree
					iterateSounds(rootID,0)
					// make graph visible
					$('#path_container').show()
				}
			})
		})
	}

	function startWithId(id) {
		$.getJSON('http://api.soundcloud.com/users/'+id+
		'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(user) {
			console.log("Start graph search for user " + user.username)
			rootID = user.id
			users[rootID] = new User(rootID, user)
			// start traveling down the tree
			iterateSounds(rootID,0)
			// make graph visible
			$('#path_container').show()

		})
	}




	// START HERE

	// display "Loading"
    var mcp = HalfViz("#halfviz")
    updateGraph('Loading -> Your Data')
	setTimeout(function() {	$(window).resize()},300)
	writeGraphSource()

	// startWithOAuth()
	startWithId('eleonore-van-roosendaal')
	// emeli-st-rmer
	// eleonore-van-roosendaal

})