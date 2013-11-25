/*jshint asi: true*/

var SOUNDCLOUD_CLIENT_ID = '81d9704f45e2b1d224e791d20eb76d2f'


$(document).ready(function() {
	// count how many users have been processed
	var maxDegree = 2
	var minNodeDegree = 7

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

		// this.setFollowers = function setFollowers(followersList) {
		// 	this.followers = followersList
		// 	this.queried.followers = true
		// }
	}

	function Sound(id, sound_obj) {
		this.id = id
		if (sound_obj) this.soundData = sound_obj
		this.connectedUsers = [] // users that have favorited etc this sound

		// add a user that has favorited etc this sound to the list
		this.connectUser = function connectUser(id) {
			if (this.connectedUsers.indexOf(id) == -1)
				this.connectedUsers.push(id)
		}
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

	function getFollowings(id, degree, parentid) {
		// mind that soundcloud by default only gives the first 50 followings
		$.getJSON('http://api.soundcloud.com/users/'+id+'/followings'+
			'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(followings) {

				// process the followings
				for (var i = 0; i < followings.length; i++) {
					var follower = followings[i]
					// store user if not already done
					if (!(follower.id in usersProcessed)) {
						follower.degree = degree
						follower.followers = []
						follower.followings = []
						usersProcessed[follower.id] = follower
						// get this user's tracks
						getFavorites(follower.id,degree)
					}
					// store that the original user is following this guy and vice versa
					usersProcessed[id].followings.push(follower.id)
					usersProcessed[follower.id].followers.push(id)

				}
		})
	}

	function getFavorites(id, degree) {
		// mind that soundcloud by default only gives the first 50 likes
		$.getJSON('http://api.soundcloud.com/users/'+id+'/favorites'+
			'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(favorites) {
				// console.log('User '+ id + ' has ' + favorites.length + ' favorites.')
				// console.log(favorites)

				// followings will be pulled if favorites intersect with root favorites
				var likesCommonWithRoot = 0

				// process favorites
				for (var i = 0; i < favorites.length; i++) {
					var track = favorites[i]
					// store track if not done already
					if (!(track.id in tracksSighted)) {
						track.likedBy = []
						tracksSighted[track.id] = track
						// console.log('Track ' + track.id + ' stored.')
					}
					// list of known users that like this track
					var likers = tracksSighted[track.id].likedBy
					if (likers.indexOf(id) != -1) console.log(id + ' bereits in liste')

					// check if like intersects with root user
					if (likers.indexOf(rootID) != -1) likesCommonWithRoot+=1

					// insert edge if:
					if (likers.length>=minNodeDegree-1) {
						// show on graph that current user likes this track
						edges.push('' + usersProcessed[id].username + ' -> ' + track.title)
						if (likers.length == minNodeDegree-1) {
							// draw edges for other users that like the track
							for (var j=0; j<likers.length; j++) {
								edges.push(usersProcessed[likers[j]].username + ' -> ' + track.title)
							}
						}
					}

					// note that current user likes this track
					likers.push(id)
				}
				updateGraph(edges.join('\n'))
				// continue down the tree if the user had common likes with root and is not too far away
				// the higher the degree, the more common likes are required!
				if (likesCommonWithRoot - degree >0 || id == rootID) {
					console.log('User ' + id + ' at degree ' + degree + ' has ' +
						likesCommonWithRoot + ' common likes with root. follow up.')
					if (degree < maxDegree) {
						console.log('degree is '+degree+'. get followings')
						getFollowings(id, degree+1)
					}
					else {
						console.log('no follow up, degree too high')
					}
				}
		})
	}

	// when a sound as at least minNodeDegree edges, include it into graph
	function checkGraphInclusion(soundId) {
		var sound = sounds[soundId]
		if (sound.connectedUsers.length >= minNodeDegree) {
			console.log('Sound ' + sound.soundData.title + ' into graph!')
			$.each(sound.connectedUsers, function(index, userId) {
				// syntax of graph source is "nodename -> nodename"
				var user = users[userId]
				console.log(user)
				edges.push(user.userData.username + ' -> ' + sound.soundData.title)
				updateGraph(edges.join('\n'))
			})
		}
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
				sounds[track.id].connectUser(id)

				// check new data allows to include the sound into the graph
				checkGraphInclusion(track.id)
			}

		user.queried.sounds = true

		// proceed algorithm with callback
		if (callback) callback(id, degree)
			
		})
	}

	// get all followings, followers for a user from soundcloud API
	function queryConnectedUsers(id, degree, callback) {
		var user = users[id]
		user.followers = []
		user.followings = []
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
		// 	') with root user (' + rootSounds.length + '). Degree ' +
		// 	degree)

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

	// get data of initial user, then start traveling down the tree
	$.getJSON('http://api.soundcloud.com/users/'+rootID+
		'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(user_data) {
			rootID = user_data.id
			users[rootID] = new User(rootID, user_data)
			// start traveling down the tree
			iterateSounds(rootID,0)
			// user_data.followings = []
			// user_data.followers = []
			// usersProcessed[rootID] = user_data
			// getFavorites(rootID, 0 , 'root')
	})

})

function checkforduplicates(list) {
	var counts = {}
	var elem
	for (var i = 0; i< list.length; i++) {
		elem = list[i]
		if (elem in counts) counts[elem]+=1
		else counts[elem] =  1
	}
	for (var j in counts) {
		if (counts[j] > 1) console.log(j + ' times ' + counts[j])
	}
}