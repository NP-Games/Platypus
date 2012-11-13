/**
 * Uses 'entity-container' component messages if triggered to add to its collision list;
 * also listens for explicit add/remove messages (useful in the absence of 'entity-container'). - DDD
 */
platformer.components['collision-group'] = (function(){
	var component = function(owner, definition){
		this.owner = owner;
		
		// Messages that this component listens for
		this.listeners = [];
		
		this.addListeners([
		    'tick',
		    'load',
		    'child-entity-added',   'add-collision-entity',
		    'child-entity-removed', 'remove-collision-entity',
		    'check-collision-group'
		]);  
		//this.toResolve = [];
		
		var self = this;
		this.owner.getCollisionGroup = function(){
			return self.entities;
		};
		this.owner.getCollisionGroupAABB = function(){
			return self.getAABB();
		};
		
		this.entities = [];
		this.collisionGroups = []; //defined here so we aren't continually recreating new arrays
		this.entitiesByType = {};
		this.terrain = undefined;
		this.aabb     = new platformer.classes.aABB();
		this.prevAABB = new platformer.classes.aABB();
	};
	var proto = component.prototype; 

	proto['child-entity-added'] = proto['add-collision-entity'] = function(entity){
		var messageIds = entity.getMessageIds(); 
		
		if ((entity.type == 'tile-layer') || (entity.type == 'collision-layer')) { //TODO: probably should have these reference a required function on the obj, rather than an explicit type list since new collision entity map types could be created - DDD
			this.terrain = entity;
		} else {
			for (var x = 0; x < messageIds.length; x++){
				if (messageIds[x] == 'prepare-for-collision'){
					if(!this.entitiesByType[entity.collisionType]){
						this.entitiesByType[entity.collisionType] = [];
					}
					this.entities.push(entity);
					this.entitiesByType[entity.collisionType].push(entity);
					break;
				}
			}
		}
	};
	
	proto['child-entity-removed'] = proto['remove-collision-entity'] = function(entity){
		var x = 0;

		for (x in this.entitiesByType[entity.collisionType]) {
			if(this.entitiesByType[entity.collisionType][x] === entity){
				this.entitiesByType[entity.collisionType].splice(x, 1);
				break;
			}
		}
		for (x in this.entities) {
			if(this.entities[x] === entity){
				this.entities.splice(x, 1);
				break;
			}
		}
	};
	
	proto['load'] = function(){
		
	};
	
	proto['tick'] = proto['check-collision-group'] = function(resp){

		var swap = this.prevAABB,
		goalX    = this.owner.x - this.lastX,
		goalY    = this.owner.y - this.lastY;

		this.prevAABB = this.aabb;
		this.aabb     = swap;
		
		this.owner.x = this.lastX;
		this.owner.y = this.lastY;
		
		this.checkGroupCollisions(resp);
		this.checkSolidCollisions(resp);

		this.aabb.reset();
		for (var x = 0; x < this.entities.length; x++){
			this.aabb.include(this.entities[x].getCollisionGroupAABB?this.entities[x].getCollisionGroupAABB():this.entities[x].getAABB());
		}

		this.owner.x += goalX;
		this.owner.y += goalY;
		this.aabb.move(this.aabb.x + goalX, this.aabb.y + goalY);

		this.checkSoftCollisions(resp);
	};
	
	proto.getAABB = function(){
		return this.aabb;
	};

	proto.checkGroupCollisions = function (resp){
		var groups = this.collisionGroups;
		
		groups.length = 0;
		for (var x = 0; x < this.entities.length; x++){
			if(this.entities[x] !== this.owner){
				if(this.entities[x].trigger('check-collision-group', resp)){
					groups.push(this.entities[x]);
				};
			}
		}

		this.resolveCollisionList(groups, true);
	};

	proto.checkSolidCollisions = function (resp){
		var x    = 0,
		y        = 0,
		entities = [];
		
		for (x = this.entities.length - 1; x > -1; x--)
		{
			if(this.owner !== this.entities[x]){
				if(this.entities[x].trigger('prepare-for-collision', resp)){
					if(this.entities[x].solidCollisions.length > 0){
						this.entities[x].collisionUnresolved = true;
						entities.push(this.entities[x]);
					}
				} else { // remove the entity because it no longer has a collision handler
					var typeEntities = this.entitiesByType[this.entities[x].collisionType];
					for (y = typeEntities.length - 1; y > -1; y--)
					{
						if(typeEntities[y] === this.entities[x]){
							typeEntities.splice(y, 1);
							break;
						}
					}
					this.entities.splice(x, 1);
				}
			}
		}
		
		this.resolveCollisionList(entities, false);
	};
	
	proto.resolveCollisionList = function(entities, group){
		for (var x = entities.length - 1; x > -1; x--){
			if(entities[x].collisionUnresolved){
				if(entities[x].postponeCollisionCheck && (entities[x].postponeCollisionCheck.length > 0)){
					this.resolveCollisionList(entities[x].postponeCollisionCheck);
					entities[x].postponeCollisionCheck.length = 0;
					entities[x].trigger('collision-postponement-resolved');
				}
				this.checkSolidEntityCollision(entities[x], group);
				entities[x].collisionUnresolved = false;
			}
		}
	};
	
	proto.checkSolidEntityCollision = function(ent, groupCheck){
		var y = 0,
		z = 0,
		initialX = 0,
		initialY = 0,
		triggerMessages = [];

		/******/
		
		var currentAABB = groupCheck?ent.getCollisionGroupAABB():ent.getAABB();
		var previousAABB = groupCheck?ent.getPreviousCollisionGroupAABB():ent.getPreviousAABB();//ent.getAABB().getCopy().move(ent.getPreviousX() + ent.getShapes()[0].getXOffset(), ent.getPreviousY() + ent.getShapes()[0].getYOffset());
		
		var sweepTop = Math.min(currentAABB.top, previousAABB.top);
		var sweepBottom = Math.max(currentAABB.bottom, previousAABB.bottom);
		var sweepHeight = sweepBottom - sweepTop;
		var sweepLeft = Math.min(currentAABB.left, previousAABB.left);
		var sweepRight = Math.max(currentAABB.right, previousAABB.right);
		var sweepWidth = sweepRight - sweepLeft;
		var sweepX = sweepLeft + (sweepWidth / 2);
		var sweepY = sweepTop + (sweepHeight / 2); 
		var sweepAABB = new platformer.classes.aABB(sweepX, sweepY, sweepWidth, sweepHeight);
		var potentialTiles = [];
		var potentialsEntities = [];
		var otherEntity = undefined;

		for (y = 0; y < ent.solidCollisions.length; y++)
		{
			if(this.entitiesByType[ent.solidCollisions[y]]){
				for(z = 0; z < this.entitiesByType[ent.solidCollisions[y]].length; z++){
					otherEntity = this.entitiesByType[ent.solidCollisions[y]][z];
					if((!otherEntity.postponeCollisionCheck || (otherEntity.postponeCollisionCheck.length === 0)) && (otherEntity !== ent) && (this.AABBCollision(sweepAABB, otherEntity.getPreviousAABB()))) {
						potentialsEntities.push(this.entitiesByType[ent.solidCollisions[y]][z]);
					}
				}
			} else if (this.terrain && (ent.solidCollisions[y] === 'tiles')){
				potentialTiles = this.terrain.getTiles(sweepAABB);
			}
		}
		
		triggerMessages.length = 0;
		
		initialX  = previousAABB.x;//ent.getPreviousX();
		var xPos  = initialX;
		var xGoal = currentAABB.x;//ent.x;
		var xDir  = (xPos < xGoal) ? 1 : -1;
		var finalX = undefined; 
		var collisionsX = [];
		var tileCollisionX = undefined;
		var aabbOffsetX = previousAABB.x - ent.getPreviousX();//previousAABB.x - initialX;
		
		initialY  = previousAABB.y;//ent.getPreviousY();
		var yPos  = initialY;
		var yGoal = currentAABB.y;//ent.y;
		var yDir  = (yPos < yGoal) ? 1 : -1;
		var finalY = undefined;
		var collisionsY = [];
		var tileCollisionY = undefined;
		var aabbOffsetY = previousAABB.y - ent.getPreviousY();//previousAABB.y - initialY;
		
		//////////////////////////////////////////////////////////////////////
		//MOVE IN THE X DIRECTION
		//////////////////////////////////////////////////////////////////////
		while (xPos != xGoal && (potentialTiles.length || potentialsEntities.length))
		{
			if (Math.abs(xGoal - xPos) < 1)
			{
				xPos = xGoal;
			} else {
				xPos += xDir;
			}
//			previousAABB.move(xPos + aabbOffsetX, yPos + aabbOffsetY);
			previousAABB.move(xPos, yPos);
			
			//CHECK AGAINST TILES
			var tileAABB = undefined;
			for (var t = 0; t < potentialTiles.length; t++)
			{
				tileAABB = potentialTiles[t].shapes[0].getAABB();
				if(this.AABBCollision(previousAABB, tileAABB))
				{
					if(this.preciseCollision(ent, potentialTiles[t]))
					{
						var atX = undefined;
						//TODO: How we solve for atX is going to need to change when we're dealing with non-rectangular objects.
						if (xDir > 0)
						{
							atX = tileAABB.left - previousAABB.halfWidth;
						} else {
							atX = tileAABB.right + previousAABB.halfWidth;
						}
						
						if ( typeof tilecollisionX === 'undefined') {
							tileCollisionX = {atX: atX, aABB: tileAABB, shape: potentialTiles[t].shapes[0]};
						} else if (xDir > 0) {
							if (atX < tileCollisionX.atX)
							{
								tileCollisionX = {atX: atX, aABB: tileAABB, shape: potentialTiles[t].shapes[0]};
							}
						} else {
							if (atX > tileCollisionX.atX)
							{
								tileCollisionX = {atX: atX, aABB: tileAABB, shape: potentialTiles[t].shapes[0]};
							}
						}
					}
				}
			}
			
			//CHECK AGAINST SOLID ENTITIES
			var entityAABB = undefined;
			for (var u = 0; u < potentialsEntities.length; u++)
			{
				entityAABB = potentialsEntities[u].collisionUnresolved?potentialsEntities[u].getPreviousAABB():potentialsEntities[u].getAABB();
				if(this.AABBCollision(previousAABB, entityAABB))
				{
					if(this.preciseCollision(ent, potentialsEntities[u]))
					{
						var atX = undefined;
						//TODO: How we solve for atX is going to need to change when we're dealing with non-rectangular objects.
						if (xDir > 0)
						{
							atX = entityAABB.left - previousAABB.halfWidth;
							if (tileCollisionX && atX > tileCollisionX.atX)  
							{
								//If the tile is collided with before this, we can skip it.
								continue;
							}
						} else {
							atX = entityAABB.right + previousAABB.halfWidth;
							if (tileCollisionX && atX < tileCollisionX.atX)  
							{
								//If the tile is collided with before this, we can skip it.
								continue;
							}
						}
						
						if (collisionsX.length == 0) {
							//finalX = atX;
							collisionsX.push({atX: atX, entity: potentialsEntities[u]});
						} else if (xDir > 0) {
							var insertIndex = 0; 
							for (var c = 0; c < collisionsX.length; c++)
							{
								if (atX < collisionsX[c].atX)
								{
									insertIndex = c;
									break;
								}
							}
							collisionsX.splice(insertIndex, 0, {atX: atX, type: potentialsEntities[u].collisionType, aABB: entityAABB,  entity: potentialsEntities[u]});
						} else {
							var insertIndex = 0; 
							for (var c = 0; c < collisionsX.length; c++)
							{
								if (atX > collisionsX[c].atX)
								{
									insertIndex = c;
									break;
								}
							}
							collisionsX.splice(insertIndex, 0, {atX: atX, type: potentialsEntities[u].collisionType, aABB: entityAABB,  entity: potentialsEntities[u]});
							
						} 
					}
				}
					
			}
			
			var complete = false;
			for(var q = 0; q < collisionsX.length; q++)
			{
				complete = ent.routeSolidCollision?ent.routeSolidCollision('x', xDir, collisionsX[q]):true;
				if (complete)
				{
					triggerMessages.push({
						entity: collisionsX[q].entity,
						type:   collisionsX[q].entity.collisionType,
						shape:  collisionsX[q].entity.shape,
						x: xDir,
						y: 0
					});
					if(((collisionsX[q].atX > initialX) && (xDir > 0)) || ((collisionsX[q].atX < initialX) && (xDir < 0))){
						finalX = collisionsX[q].atX;
					} else {
						finalX = initialX;
					}
					break;
				}
			}	
			
			if (ent.routeTileCollision)
			{
				var complete = false;
				if(typeof finalX === 'undefined' && tileCollisionX)
				{
					complete = ent.routeTileCollision('x', xDir, tileCollisionX);
					if (complete)
					{
						triggerMessages.push({
							type:   'tiles',
							shape:  tileCollisionX.shape,
							x: xDir,
							y: 0
						});
						finalX = tileCollisionX.atX;
					}
				}
			}
			
			if(typeof finalX !== 'undefined')
			{
				break;
			}
			
		}
		
		if(typeof finalX === 'undefined')
		{
			
			finalX = xGoal;
		}
		
		//////////////////////////////////////////////////////////////////////
		//MOVE IN THE Y DIRECTION
		//////////////////////////////////////////////////////////////////////

		while (yPos != yGoal && (potentialTiles.length || potentialsEntities.length))
		{
			if (Math.abs(yGoal - yPos) < 1)
			{
				yPos = yGoal;
			} else {
				yPos += yDir;
			}
//			previousAABB.move(finalX + aabbOffsetX, yPos + aabbOffsetY);
			previousAABB.move(finalX, yPos);
			
			//CHECK AGAINST TILES
			var tileAABB = undefined;
			for (var t = 0; t < potentialTiles.length; t++)
			{
				tileAABB = potentialTiles[t].shapes[0].getAABB();
				if(this.AABBCollision(previousAABB, tileAABB))
				{
					if(this.preciseCollision(ent, potentialTiles[t]))
					{
						var atY = undefined;
						//TODO: How we solve for atY is going to need to change when we're dealing with non-rectangular objects.
						if (yDir > 0)
						{
							atY = tileAABB.top - previousAABB.halfHeight; 
						} else {
							atY = tileAABB.bottom + previousAABB.halfHeight;
						}
						 
						if ( typeof tilecollisionY === 'undefined') {
							tileCollisionY = {atY: atY, aABB: tileAABB,  shape: potentialTiles[t].shapes[0]};
						} else if (yDir > 0) {
							if (atY < tileCollisionY.atY)
							{
								tileCollisionY = {atY: atY, aABB: tileAABB,  shape: potentialTiles[t].shapes[0]};
							}
						} else {
							if (atY > tileCollisionY.atY)
							{
								tileCollisionY = {atY: atY, aABB: tileAABB,  shape: potentialTiles[t].shapes[0]};
							}
						} 
					}
				}
			}
			
			//CHECK AGAINST SOLID ENTITIES
			var entityAABB = undefined;
			for (var u = 0; u < potentialsEntities.length; u++)
			{
				entityAABB = potentialsEntities[u].collisionUnresolved?potentialsEntities[u].getPreviousAABB():potentialsEntities[u].getAABB();
				if(this.AABBCollision(previousAABB, entityAABB))
				{
					if(this.preciseCollision(ent, potentialsEntities[u]))
					{
						var atY = undefined;
						//TODO: How we solve for atY is going to need to change when we're dealing with non-rectangular objects.
						if (yDir > 0)
						{
							atY = entityAABB.top - previousAABB.halfHeight;
							if (tileCollisionY && atY > tileCollisionY.atY)  
							{
								//If the tile is collided with before this, we can skip it.
								continue;
							}
						} else {
							atY = entityAABB.bottom + previousAABB.halfHeight;
							if (tileCollisionY && atY < tileCollisionY.atY)  
							{
								//If the tile is collided with before this, we can skip it.
								continue;
							}
						}
																						
						if (collisionsY.length == 0) {
							//finalX = atX;
							collisionsY.push({atY: atY, entity: potentialsEntities[u]});
						} else if (yDir > 0) {
							var insertIndex = 0; 
							for (var c = 0; c < collisionsY.length; c++)
							{
								if (atY < collisionsY[c].atY)
								{
									insertIndex = c;
									break;
								}
							}
							collisionsY.splice(insertIndex, 0, {atY: atY, type: potentialsEntities[u].collisionType, aABB: entityAABB,  entity: potentialsEntities[u]});
						} else {
							var insertIndex = 0; 
							for (var c = 0; c < collisionsY.length; c++)
							{
								if (atY > collisionsY[c].atY)
								{
									insertIndex = c;
									break;
								}
							}
							collisionsY.splice(insertIndex, 0, {atY: atY, type: potentialsEntities[u].collisionType, aABB: entityAABB,  entity: potentialsEntities[u]});
						} 
					}
				}
			}
			
			var complete = false;
			for(var q = 0; q < collisionsY.length; q++)
			{
				complete = ent.routeSolidCollision?ent.routeSolidCollision('y', yDir, collisionsY[q]):true;
				if (complete)
				{
					triggerMessages.push({
						entity: collisionsY[q].entity,
						type:   collisionsY[q].entity.collisionType,
						shape:  collisionsY[q].entity.shape,
						x: 0,
						y: yDir
					});
					if(((collisionsY[q].atY > initialY) && (yDir > 0)) || ((collisionsY[q].atY < initialY) && (yDir < 0))){
						finalY = collisionsY[q].atY;
					} else {
						finalY = initialY;
					}
					break;
				}
			}
			
			if (ent.routeTileCollision)
			{
				var complete = false;
				if(typeof finalY === 'undefined' && tileCollisionY)
				{
					complete = ent.routeTileCollision('y', yDir, tileCollisionY);
					if (complete)
					{
						triggerMessages.push({
							type:   'tiles',
							shape:  tileCollisionY.shape,
							x: 0,
							y: yDir
						});
						finalY = tileCollisionY.atY;
					}
				}
			}
			
			
			if(typeof finalY !== 'undefined')
			{
				break;
			}
		}
		
		
		if(typeof finalY === 'undefined')
		{
			finalY = yGoal;
		}

		if(groupCheck){
			this.relocateGroup(finalX - aabbOffsetX - initialX, finalY - aabbOffsetY - initialY);
		} else {
			ent.trigger('relocate-entity', {x: finalX - aabbOffsetX, y: finalY - aabbOffsetY});
		}

		for (var i in triggerMessages){
			ent.trigger('hit-by-' + triggerMessages[i].type, triggerMessages[i]);
			if(triggerMessages[i].entity){ //have to go both ways because the alternate direction may not be checked if the alternate entity is not moving toward this entity
				triggerMessages[i].entity.trigger('hit-by-' + ent.collisionType, {
					entity: ent,
					type:   ent.collisionType,
					shape:  ent.shape,
					x: -triggerMessages[i].x,
					y: -triggerMessages[i].y
				});
			}
		}
	};
	
	proto.checkSoftCollisions = function (resp)
	{
		var otherEntity = undefined,
		ent = undefined,
		x   = 0,
		y   = 0,
		z   = 0;
		
		for(x = 0; x < this.entities.length; x++){
			ent = this.entities[x];
			for (y = 0; y < ent.softCollisions.length; y++){
				if(this.entitiesByType[ent.softCollisions[y]]){
					for(z = 0; z < this.entitiesByType[ent.softCollisions[y]].length; z++){
						otherEntity = this.entitiesByType[ent.softCollisions[y]][z];
						if((otherEntity !== ent) && (this.AABBCollision(ent.getAABB(), otherEntity.getAABB()))) {
							if (this.preciseCollision(ent, otherEntity))
							{
								ent.trigger('hit-by-' + otherEntity.collisionType, {
									entity: otherEntity,
									type:   otherEntity.collisionType,
									shape:  otherEntity.shape
								});
							}
						}
					}
				}
			}
		}
	};
	
	proto.AABBCollision = function (boxX, boxY)
	{
		if(boxX.left   >=  boxY.right)  return false;
		if(boxX.right  <=  boxY.left)   return false;
		if(boxX.top    >=  boxY.bottom) return false;
		if(boxX.bottom <=  boxY.top)    return false;
		return true;
	};
	
	proto.preciseCollision = function (entityA, entityB){
		var i = 0,
		j     = 0,
		aabb  = undefined,
		shapesA = entityA.shapes || entityA.getShapes(),
		shapesB = entityB.shapes || entityB.getShapes();
		
		if((shapesA.length > 1) || (shapesB.length > 1)){
			for (i = 0; i < shapesA.length; i++){
				aabb = shapesA[i].getAABB();
				for (j = 0; j < shapesB.length; j++){
					if((this.AABBCollision(aabb, shapesB[j].getAABB())) && (this.shapeCollision(shapesA[i], shapesB[j]))){
						return true; //TODO: return all true instances instead of just the first one in case they need to be resolved in unique ways - DDD
					}
				}
			}
			return false;
		} else {
			return this.shapeCollision(shapesA[0], shapesB[0]);
		}
	};
	
	proto.shapeCollision = function(shapeA, shapeB){
		return true;
	};
	
	proto.relocateGroup = function(dx, dy){
		for (var x = 0; x < this.entities.length; x++){
//			if(this.entities[x] !== this.owner){
				this.entities[x].trigger('relocate-entity', {x:this.entities[x].x + dx, y:this.entities[x].y + dy});
//			}
		}
	};
	
	// This function should never be called by the component itself. Call this.owner.removeComponent(this) instead.
	proto.destroy = function(){
		this.removeListeners(this.listeners);
		this.entities.length = 0;
		for (var i in this.entitiesByType){
			this.entitiesByType[i].length = 0;
		}
	};
	
	/*********************************************************************************************************
	 * The stuff below here will stay the same for all components. It's BORING!
	 *********************************************************************************************************/
	
	proto.addListeners = function(messageIds){
		for(var message in messageIds) this.addListener(messageIds[message]);
	};

	proto.removeListeners = function(listeners){
		for(var messageId in listeners) this.removeListener(messageId, listeners[messageId]);
	};
	
	proto.addListener = function(messageId, callback){
		var self = this,
		func = callback || function(value){
			self[messageId](value);
		};
		this.owner.bind(messageId, func);
		this.listeners[messageId] = func;
	};

	proto.removeListener = function(boundMessageId, callback){
		this.owner.unbind(boundMessageId, callback);
	};
	
	return component;
})();
