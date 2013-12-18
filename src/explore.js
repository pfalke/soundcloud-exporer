/*jshint asi: true*/

var logging = {
	'calls': true,
	'interactions': false,
	'redraws': true,
}

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

	// var dataUrl = 'https://soundcloud-explore.appspot.com/getData'
	var BACKEND_URL = 'https://soundcloud-explore.appspot.com'
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
		keepFresh = $(this).prop('checked')
		if (logging.interactions) {console.log(keepFresh)}
		determineGraphNodes()
	})

	// true: display only users that are not connected to root user
	var newPeople = false
	$('#newPeople').change(function() {
		newPeople = $(this).prop('checked')
		if (logging.interactions) {console.log(newPeople)}
		determineGraphNodes()
	})

	// exclude old tracks. fresh is 3 months, hot is 3 weeks
	var now = new Date()
	var maxAge = 100000// in days
	$('#dateRangeButtons button').click(function(e) {
		// unselect default button
		$('#btnDateAny').removeClass('active')
		var dateRange = $(this).attr('dateRange')
		if (dateRange == 'hot') {maxAge = 21}
		else if (dateRange == 'fresh') {maxAge = 90}
		else {maxAge = 10000}
		if (logging.interactions) {console.log('maxAge is now ' + maxAge)}
		// redraw graph
		determineGraphNodes()
	})



	// UI
	
	function writeListsInDashboard(soundList, userList) {
		var theList = document.createDocumentFragment()
		var entryTemplate = document.createDocumentFragment()
		var li = document.createElement("li")
		li.className = 'soundInList'
		var thumb = document.createElement('img')
		thumb.className = 'contentThumb'
		thumb.height = 100
		thumb.width = 100
		li.appendChild(thumb)
		var title = document.createElement('a')
		title.className = 'contentName'
		title.target = '_blank'
		li.appendChild(title)
		entryTemplate.appendChild(li)
		$.each(soundList, function writeList(index, sound) {
			var entry = entryTemplate.cloneNode(true)
			entry.querySelector('.contentThumb').src = sound.soundData.artwork_url
			entry.querySelector('.contentName').innerHTML = sound.soundData.title
			entry.querySelector('.contentName').href = sound.soundData.permalink_url
			theList.appendChild(entry)
		})
		document.getElementById('soundsInGraph').innerHTML = ''
		document.getElementById('soundsInGraph').appendChild(theList)
		//userList
		theList = document.createDocumentFragment()
		$.each(userList, function writeList(index, user) {
			var entry = entryTemplate.cloneNode(true)
			entry.querySelector('.contentThumb').src = user.userData.avatar_url
			var name = user.userData.username
			if (user.userData.full_name && user.userData.full_name != name) {
				name += ' (' + user.userData.full_name + ')'
			}
			entry.querySelector('.contentName').innerHTML = name
			entry.querySelector('.contentName').href = user.userData.permalink_url
			$('<a user_id="' + user.userData.id + '" href="/' + user.userData.permalink +
				'" class="label label-warning userlink" style="margin-left:5px;">View graph</a>')
				.appendTo(entry.querySelector('li'))
			theList.appendChild(entry)
		})
		document.getElementById('usersInGraph').innerHTML = ''
		document.getElementById('usersInGraph').appendChild(theList)
	}

	// input is graph in '->' form, send this to halfviz
	function updateGraph(src_text) {
        var network = parse(src_text)
        $.each(network.nodes, function(nname, ndata){
          if (ndata.label===undefined) ndata.label = nname
        })
        sys.merge(network)
        // setTimeout(function() {
        // sys.merge(network)
        // console.log('merge')
        // },1000)
        _updateTimeout = null
        // display text in input area
        $("#halfviz").find('textarea').val(src_text)
	}

	// prepare graph as string: [user] -> [sound]
	function writeGraphSrc(soundList, userCounts) {
		// write edges
		var graphSrc = ''
		var userList = []
		$.each(soundList, function(index, sound) {
			graphSrc += sound.soundData.title + ' {color:#f60}\n' // sound nodes have orange background
			// check which users to connect to the node
			$.each(sound.connectedUsersAtDegree(degreeConsidered), function(i, user) {
				if (userCounts[user.userData.id]>= minRelevantSounds) {
					graphSrc += user.userData.username + ' -> ' + sound.soundData.title + '\n'
					// add user to list 
					if (userList.indexOf(user) == -1) {userList.push(user)}
				}
			})
		})

		// pass the source to the parser
		updateGraph(graphSrc)
		writeListsInDashboard(soundList,userList)
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
				// sound must not be too old
				if (sounds[soundId].ageDays <= maxAge &&
					(!keepFresh || users[rootID].sounds.indexOf(sounds[soundId])== -1) &&
					sounds[soundId].connectedUsersAtDegree(degreeConsidered).length>=minConnectedUsers) {
					soundsInGraph.push(sounds[soundId])
					// bump count for each user associated with sound
					$.each(sounds[soundId].connectedUsersAtDegree(degreeConsidered), bumpUserCount)
				}
			}
		}

		getSoundsForGraphAndUserCounts()

		// there should be 5-15 sounds in the graph. adjust parameters as long as it makes sense
		while (soundsInGraph.length> 15 && minConnectedUsers<25) {
			minConnectedUsers +=1
			if (logging.paramterChanges) {console.log('increased nodeDegree to '+ minConnectedUsers +
							', had ' + soundsInGraph.length + ' sounds')}
			getSoundsForGraphAndUserCounts()
		}
		while (soundsInGraph.length< 5 && minConnectedUsers>3) {
			minConnectedUsers -=1
			if (logging.paramterChanges) {console.log('decreased nodeDegree to '+ minConnectedUsers +
				', had ' + soundsInGraph.length + ' sounds')}
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
			console.log(minRelevantSounds)
			computeNumerBigUsers()
		}

		writeGraphSrc(soundsInGraph, userCounts)
		// update again in .5 sec
		// setTimeout(writeGraphSource, 800)
		var then = new Date()
		if (logging.redraws)
			{console.log('took ' + (then-now) + 'ms to determine graph with ' + soundsInGraph.length + ' sounds')}
	}











	// MANAGE GRAPH DATA

	var finalDegree = 1 // how much data to fetch (degrees of separation from root user)

	var users = {} // the users that have been processed, indexed by ID
	var sounds = {} // the tracks that have been sighted, indexed by ID
	var rootID = 'pfalke' // soundcloud id of the root user for tree

	var dataTypes = {
		'connectedUsers': ['followings'],
		'sounds': ['favorites', 'tracks', 'playlists']
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

		// creation date on Soundcloud, age in days
		this.created = new Date(sound_obj.created_at)
		this.ageDays = Math.floor((now - this.created)/1000/60/60/24)

		// returns list of users up to given degree have favorited etc this sound
		this.connectedUsersAtDegree = function(degree) {
			var connectedUsers = []
			for (var i=0; i<=degree; i++) {
				connectedUsers = connectedUsers.concat(this.connectedUsers[i])
			}
			return connectedUsers
		}
	}


	function DataRetrieval() {
		var stop = false // set this flag to stop callbacks from executing
		this.stop = function() {
			stop = true
		}

		// create Sound object for newly found songs, associate sounds with User objects, signal that sounds were loaded
		function storeSounds(dataLoaded, degree) {
			var now = new Date()
			// var resp = JSON.parse(soundJSON)
			var user, data, soundObj, soundType, soundList, i
			for (var userId in dataLoaded) {
				// mark the user as queried
				user = users[userId]
				user.queried.sounds = true
				data = dataLoaded[userId]
				// iterate all lists (favorites, tracks, playlists)
				for (soundType in data) {
					// get list of tracks -> need to unbundle playlists
					if (soundType === 'playlists') {
						soundList = []
						for (var pl = 0; pl < data['playlists'].length; pl++) {
							soundList = soundList.concat(data['playlists'][pl].tracks)
						}
					} else {
						soundList =  data[soundType] // JSON.parse(data[soundType])//					
					}
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
			var then = new Date()
			console.log('took ' + (then-now) + 'ms to store sounds')

			// we're done with this degree. update buttons and graph as fit
			// enable button for this degree to allow user to look at data
			if (degree>1) {
				$('#btnDegree'+degree).addClass('btn-warning').removeAttr('disabled')
			}
			// start retrieving connectedUsers unless we reached finalDegree
			if (degree<finalDegree) {
				loadDataAtMaxDegree('connectedUsers' ,degree)
				$('#btnDegree'+(degree+1)).addClass('loading')
			}

			// rewrite graph unless we only have data for root user
			if (degree>0) {
				determineGraphNodes()
				$('#btnDegree'+degree).removeClass('loading')
			}

			if (degree === 0) {
				// check the already loaded users for sounds common with root user
				checkCoolSounds()
			}
		}

		// create User object for newly found users, associate users amongst each other, signal that users were loaded
		function storeConnections(dataLoaded, degree) {
			var now = new Date()
			// var resp = JSON.parse(usersJSON)
			var userId, user, data, dataObj, dataType, dataList, i
			for (userId in dataLoaded) {
				// mark the user as queried
				user = users[userId]
				user.queried.connectedUsers = true
				// user.followings = []
				if (!('followings' in dataLoaded[userId])) {
					continue
				}
				dataList = dataLoaded[userId]['followings']
				for (i= 0; i<dataList.length; i++) {
					dataObj = dataList[i]
					// create new user or update degree where necessary
					if (!(dataObj.id in users)) {
						users[dataObj.id] = new User(dataObj.id, degree+1, dataObj)
					} else if (users[dataObj.id].degree > user.degree+1) {
						users[dataObj.id].degree = user.degree+1
					}

					// associate users with each other
					user.followings.push(users[dataObj.id])
				}
			}

			// above we have only set the degree for followings of newly loaded users.
			// now set degree for existing users
			setDegree(degree)
			// start retrieving sounds unless we reached finalDegree
			loadDataAtMaxDegree('sounds' ,degree+1)
		}

		// for which users <= degree we haven't queried this dataType
		function loadDataAtMaxDegree(dataType, degree) {
			// outside functions can set this flag, e.g. when root user changes and new search is started
			if (stop) {
				return
			}
			var user, dataForUser
			var idsToQuery = {}
			var batches = [] // we request at most 200 objects from API at a time
			var counterCache = 0, counterAPI = 0
			// for data retrieved from cache or backend
			// var dataLoaded = {}
			for (var userId in users) {
				user = users[userId]
				// check if degree OK and we have not queried this data for this user before
				// check connected users only if user has enough cool sounds (more than his degree)
				var userGood = (!user.queried[dataType] && user.degree<=degree &&
					(dataType == 'sounds' || user.coolSounds.length>user.degree))
				if (!userGood) {
					continue
				}
				// dataLoaded[userId] = {}
				idsToQuery[userId] = [] // list of things to request from API
				for (var i = 0; i<dataTypes[dataType].length; i++) {
					var currDataType = dataTypes[dataType][i]
					// no request needs to be made if we know there is no data
					// not sure how non-public favorites are handled, so make request anyway for small degrees
					var skip = ((currDataType == 'playlists' && user.userData.playlist_count === 0) ||
						(currDataType == 'favorites' && user.userData.public_favorites_count === 0 && degree>1) ||
						(currDataType == 'tracks' && user.userData.track_count === 0) ||
						(currDataType == 'followings' && user.userData.followings_count === 0))
					if (skip) {
						continue
					}
					// // check if data can be pulled from cache
					// dataForUser = lscache.get(userId+currDataType)
					// if (dataForUser) { // found in cache
						// dataLoaded[userId][currDataType] = dataForUser
						// counterCache +=1
						// continue
					// }

					// get from API
					idsToQuery[userId].push(currDataType)
					counterAPI +=1
				}

				// requests are split in batches of ~50 to make load easier to handle for GAE
				if (counterAPI>=50) {
					batches.push(idsToQuery)
					idsToQuery = {}
					counterAPI = 0
				}
			}

			if (counterAPI>0) {batches.push(idsToQuery)}

			// getAPIData(batches, dataLoaded, dataType, degree)
			getData(batches, dataType, degree)
		}

		function getData(batches, dataType, degree) {
			var now = new Date()
			if (logging.calls)
				{console.log('order '+ batches.length + ' batches for ' + dataType)}
			var unfinishedRequests = 0

			var url = BACKEND_URL + '/getSounds'
			if (dataType == 'connectedUsers')
				{url = BACKEND_URL + '/getFollowings'}

			var dataLoaded = {
				'kinds': {}, // either the sounds or the users
				'connections': {} // {user: [sound_id, sound_id, ...]} or equiv for followings
			}

			$.each(batches, function(i, batch) {
				unfinishedRequests +=1
				$.post(url, {
					'orders' : JSON.stringify(batch),
					'quicks': 'x' // parameter "quick": for local testing, backend only does few requests
				}).done(function(resp) {
					// combine received data with data from cache
					dataLoaded = mergeReceivedData(dataLoaded, resp)
					unfinishedRequests -=1
					if (unfinishedRequests)
						{return}
					if (logging.calls) {
						var then = new Date()
						console.log('took ' + (then-now) + 'ms to get data')
					}
					processData(dataLoaded, dataType, degree)

				}).fail(function(resp) {
					console.log(resp)
					unfinishedRequests -=1
					if (!unfinishedRequests) {
						processLoadedData(dataLoaded, dataType, degree)
					}
				})
			})
		}

		function mergeReceivedData(dataLoaded, resp) {
			var recData = JSON.parse(resp)
			dataLoaded.kinds = $.extend({}, dataLoaded.kinds, recData.kinds)
			dataLoaded.connections = $.extend({}, dataLoaded.connections, recData.connections)
			return dataLoaded
		}

		function processData(dataLoaded, dataType, degree) {
			// process assembled data
			if (dataType == 'sounds') {storeSound(dataLoaded, degree)}
			else if (dataType == 'connectedUsers') {storeConnection(dataLoaded, degree)}
		}

		// create Sound object for newly found songs, associate sounds with User objects, signal that sounds were loaded
		function storeSound(dataLoaded, degree) {
			var now = new Date()

			// store all newly received sounds
			$.each(dataLoaded.kinds, function(id, soundData) {
				if (!(id in sounds))
					{sounds[id] = new Sound(id, soundData)}
			})

			// associate the users with their connected sounds
			$.each(dataLoaded.connections, function(user_id, soundList) {
				var user = users[user_id]
				user.queried.sounds = true
				for (var i = 0; i<soundList.length; i++) {
					var sound = sounds[soundList[i]]
					user.sounds.push(sound)
					sound.connectedUsers[degree].push(user)

					// sounds in common with root user are cool
					if (users[rootID].sounds.indexOf(sound)>=0) {
						user.coolSounds.push(sound)
					}
				}
			})

			var then = new Date()
			console.log('took ' + (then-now) + 'ms to store sounds')

			// we're done with this degree. update buttons and graph as fit
			// enable button for this degree to allow user to look at data
			if (degree>1) {
				$('#btnDegree'+degree).addClass('btn-warning').removeAttr('disabled')
			}
			// start retrieving connectedUsers unless we reached finalDegree
			if (degree<finalDegree) {
				loadDataAtMaxDegree('connectedUsers' ,degree)
				$('#btnDegree'+(degree+1)).addClass('loading')
			}

			// rewrite graph unless we only have data for root user
			if (degree>0) {
				determineGraphNodes()
				$('#btnDegree'+degree).removeClass('loading')
			}

			if (degree === 0) {
				// check the already loaded users for sounds common with root user
				checkCoolSounds()
			}
		}

		// create User object for newly found users, associate users amongst each other, signal that users were loaded
		function storeConnection(dataLoaded, degree) {
			var now = new Date()

			// store all newly received sounds
			$.each(dataLoaded.kinds, function(id, userData) {
				if (!(id in users))
					{users[id] = new User(id, degree+1, userData)}
			})

			// associate the users with their followings
			$.each(dataLoaded.connections, function(user_id, followingList) {
				var user = users[user_id]
				user.queried.connectedUsers = true
				for (var i = 0; i<followingList.length; i++) {
					var otherUser = users[followingList[i]]
					user.followings.push(otherUser)

					// update degree if necessary
					if (otherUser.degree > user.degree +1) {
						console.log('update degree')
						otherUser.degree = user.degree+1
					}
				}
			})

			// above we have only set the degree for followings of newly loaded users.
			// now set degree for existing users
			setDegree(degree)
			// start retrieving sounds unless we reached finalDegree
			loadDataAtMaxDegree('sounds' ,degree+1)
		}

		function getAPIData(batches, dataLoaded, dataType, degree) {
			// skip API call if there is nothing to request
			// if (batches.length === 0) {
				// if (logging.calls) {console.log('skipping ' + dataType +
					// ' API calls, all were retrieved from cache.')}
				// processLoadedData(dataLoaded, dataType, degree)
				// return
			// }

			var now = new Date()
			if (logging.calls) {console.log('order '+ batches.length + ' batches for ' + dataType)}
			var unfinishedRequests = 0

			if (true) {
				$.each(batches, function(i, batch) {
					unfinishedRequests +=1
					$.post(dataUrl, {
						'orders' : JSON.stringify(batch),
						'quicks': 'x' // parameter "quick": for local testing, backend only does few requests
					}).done(function(resp) {
						// combine received data with data from cache
						dataLoaded = mergeReceivedAPIData(dataLoaded, resp, degree)
						unfinishedRequests -=1
						if (!unfinishedRequests) {
							if (logging.calls) {
								var then = new Date()
								console.log('took ' + (then-now) + 'ms to get data')
							}
							processLoadedData(dataLoaded, dataType, degree)
						}

					}).fail(function(resp) {
						console.log(resp)
						unfinishedRequests -=1
						if (!unfinishedRequests) {
							processLoadedData(dataLoaded, dataType, degree)
						}
					})
				})
			}
			if (dataType == 'connectedUsers') {
				$.each(batches, function(i, batch) {
					$.post('https://soundcloud-explore.appspot.com/getFollowings', {
						'orders' : JSON.stringify(batch),
						'quicks': 'x' // parameter "quick": for local testing, backend only does few requests
					})
				})
			} else { // sounds
				$.each(batches, function(i, batch) {
					$.post('https://soundcloud-explore.appspot.com/getSounds', {
						'orders' : JSON.stringify(batch),
						'quicks': 'x' // parameter "quick": for local testing, backend only does few requests
					})
				})
			}
		}

		function mergeReceivedAPIData(dataLoaded, resp, degree) {
			var recData = JSON.parse(resp)
			for (var userId in recData) {
				var userData = recData[userId]
				// iterate all lists (favorites, tracks)
				for (var dataKind in userData) {
					// var dataSet = JSON.parse(userData[dataKind])
					dataLoaded[userId][dataKind] = userData[dataKind] // dataSet
					// store in cache (JSON as received). 
					// 10min storing for root user, one day for first degree
					// no caching for high degrees - that might overwrite data from low degrees!
					if (degree<=1) {
						var cacheTime = (degree === 0) ? 10 : 60*24
						lscache.set(userId+dataKind, userData[dataKind], cacheTime)
						// lscache.set(userId+dataKind, dataSet, cacheTime)
					}
				}
			}
			return dataLoaded
		}

		function processLoadedData(dataLoaded, dataType, degree) {
			// process assembled data
			if (dataType == 'sounds') {storeSounds(dataLoaded, degree)}
			else if (dataType == 'connectedUsers') {storeConnections(dataLoaded, degree)}
		}
		
		// kick of retrieving data
		loadDataAtMaxDegree('sounds', 0)

	}








	// USER INTERACTIONS etc

	function checkCoolSounds() {
		var cools = users[rootID].sounds
		for (var userId in users) {
			var user = users[userId]
			for (var i=0; i<user.sounds.length; i++) {
				if (cools.indexOf(user.sounds[i]) != -1) {
					user.coolSounds.push(user.sounds[i])
				}
			}
		}
	}

	// make sure the followings of a given degree are set to <=degree+1
	function setDegree(degree) {
		for (var user in users) {
			if (user.degree != degree)
				{continue}
			for (var i = 0; i<user.followings.length; i++) {
				if (user.followings[i].degree>degree+1)
					{user.followings[i].degree = degree+1}
			}
		}
	}

	// set degrees of seperation for all loaded users, starting out with the root user
	// perform BFS
	function setDegrees() {
		users[rootID].degree = 0
		var currDegree = 0
		var unprocessedCurrDegree = [users[rootID]]
		while (degree < finalDegree) {
			var unprocessedNextDegree = []
			for (var i=0; i<unprocessedCurrDegree.length; i++) {
				var followings = unprocessedCurrDegree[i].followings
				for (var j=0; j<followings.length; j++) {
					// degree has already been set for those in unprocessedNextDegree and in unprocessedCurrDegree
					// hence we can skip anyone with such a degree
					if (followings[j].degree<=currDegree+1)
						{continue}
					followings[i].degree = currDegree +1
					unprocessedNextDegree.push(followings[i])
				}
			}
			degree +=1
			unprocessedCurrDegree = unprocessedNextDegree
		}
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

	function getRootUserData(id, accessTokenSC) {
		var url = 'https://api.soundcloud.com/users/'+id+'.json?client_id='+SOUNDCLOUD_CLIENT_ID
		if (id == 'me' && accessTokenSC) {
			url = "https://api.soundcloud.com/me.json?oauth_token=" + accessTokenSC
		}
		$.getJSON(url).done(function(user) {
			if (logging.calls) {console.log('got data for root user: ' + user.username)}
			users[user.id] = new User(user.id, 0, user)

			// log visits of logged in users to their own tree
			if (id == 'me' && accessTokenSC) {
				logVisit(user)
			}

			// start algorithm
			startWithId(user.id)
		})
	}

	function startWithId(id, accessTokenSC) {
		// load data first - may later not be necessary if we already found the user in some other tree
		if (!(id in users)) {
			getRootUserData(id, accessTokenSC)
			return
		}
		var rootUser = users[id]
		console.log("Start graph search for user " + rootUser.userData.username)
		rootID = id
		rootUser.degree = 0
		// start retrieving data. global variable so it can be stopped
		window.currDataRetrieval = new DataRetrieval()
		// URL for sharing
		var newurl = location.protocol+'//'+location.hostname+
			(location.port ? ':'+location.port: '')+'/'+rootUser.userData.permalink
		history.pushState({id: rootUser.userData.permalink}, '', newurl);

		// show button for Connect to Soundcloud if not connected
		if (!localStorage.accessTokenSC) {
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




	lscache.flush()


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

	// clicking on a list item in the dashboard starts graph for that user
	$('.userlink').click(function(e) {
		// stop the current search
		window.currDataRetrieval.stop()
		// user degrees will be set to match new root
		for (var user in  users) {
			user.degree = 999
			user.coolSounds = []
		}
		e.preventDefault()
		var id = $(this).prop('user_id')
		startWithId(id)
		return false
	})

	// startWithId('emeli-st-rmer')
	// emeli-st-rmer
	// eleonore-van-roosendaal

})