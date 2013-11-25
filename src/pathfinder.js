/*jshint asi: true*/

var SOUNDCLOUD_CLIENT_ID = '81d9704f45e2b1d224e791d20eb76d2f'


$(document).ready(function() {
	// count how many users have been processed
	var maxDegree = 5
	var minNodeDegree = 7

	// parser for halfviz
	var parse = Parseur().parse

	var usersProcessed = {} // the users that have been processed, indexed by ID
	// for each user, list of followers, list of followings, list of tracks and queried resources are stored
	var tracksSighted = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree
	var edges = [] // edges to be drawn in the graph. these also define the nodes

	// a user, local copy of data pulled from Soundcloud
	function User(id) {
		this.id = id
		this.queried = {
			'user_data': false,
			'followers': false,
			'followings': false,
			'favorites': false,
			'playlists': false,
			'tracks': false
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
						getFavorites(follower.id,degree)
					}
					// store that the original user is following this guy and vice versa
					usersProcessed[id].followings.push(follower.id)
					usersProcessed[follower.id].followers.push(id)

					// get this user's tracks
				}
		})
	}

	function getFavorites(id, degree) {
		// mind that soundcloud by default only gives the first 50 likes
		$.getJSON('http://api.soundcloud.com/users/'+id+'/favorites'+
			'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(favorites) {
				// console.log('User '+ id + ' has ' + favorites.length + ' favorites.')
				// console.log(favorites)

				// followerings will be pulled if favorites intersect with root favorites
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

	// get data of initial user, then start traveling down the tree
	$.getJSON('http://api.soundcloud.com/users/'+rootID+
		'.json?client_id='+SOUNDCLOUD_CLIENT_ID).done(function(user_data) {
			rootID = user_data.id
			user_data.followings = []
			user_data.followers = []
			usersProcessed[rootID] = user_data
			getFavorites(rootID, 0 , 'root')
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