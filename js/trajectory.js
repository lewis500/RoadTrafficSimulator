define(function(require) {
    "use strict";

    var LanePosition = require("lane-position"),
        Curve = require("geometry/curve");

    function Trajectory(car, lane, position) {
        this.car = car;
        this.current = new LanePosition(this.car, lane, position || 0);
        this.next = new LanePosition(this.car, null, NaN);
        this.temp = new LanePosition(this.car, null, NaN);
        this.isChangingLanes = false;
    }

    Object.defineProperty(Trajectory.prototype, "lane", {
        get: function() {
            return this.temp.lane ? this.temp.lane : this.current.lane;
        },
    });

    Object.defineProperty(Trajectory.prototype, "absolutePosition", {
        get: function() {
            return this.temp.lane ? this.temp.position : this.current.position;
        },
    });

    Object.defineProperty(Trajectory.prototype, "relativePosition", {
        get: function() {
            return this.absolutePosition / this.lane.length;
        },
    });

    Object.defineProperty(Trajectory.prototype, "direction", {
        get: function() {
            return this.lane.getDirection(this.relativePosition);
        },
    });

    Object.defineProperty(Trajectory.prototype, "coords", {
        get: function() {
            return this.lane.getPoint(this.relativePosition);
        },
    });

    Trajectory.prototype.getDistanceToNextCar = function() {
        return Math.min(
            this.current.getDistanceToNextCar(),
            this.next.getDistanceToNextCar()
        );
    };

    Trajectory.prototype.getNextIntersection = function() {
        return this.current.lane.targetIntersection;
    };

    Trajectory.prototype.getPreviousIntersection = function() {
        return this.current.lane.sourceIntersection;
    };

    Trajectory.prototype.canEnterIntersection = function(nextLane) {
        //TODO: right turn is allowe donly form right lane
        var sourceLane = this.current.lane;
        if (!nextLane) {
            // the car will be removed from the world
            throw Error("It should have been processed before");
            // return true;
        }
        var intersection = sourceLane.targetIntersection;
        var side1 = sourceLane.targetSideId,
            side2 = nextLane.sourceSideId;
        var turnNumber = (side2 - side1 - 1 + 4) % 4; // 0 - left, 1 - forward, 2 - right
        if (side1 === side2) {
            throw Error("No U-turn are allowed");
            // turnNumber = 0; // same as left turn
        }
        return intersection.state[side1][turnNumber];
    };

    Trajectory.prototype.moveForward = function(distance) {
        if (this.current.position + this.car.length >= this.current.lane.length &&
                !this.isChangingLanes) {
            if (this.canEnterIntersection(this.car.nextLane)) {
                this.startChangingLanes(this.car.nextLane, 0, true);
            } else {
                // FIXME: car model should set appropriate acceleration itself
                this.car.speed = 0;
                distance = 0;
            }
        }

        this.current.position += distance;
        this.next.position += distance;
        this.temp.position += distance;

        if (this.isChangingLanes && this.temp.position >= this.temp.lane.length) {
            this.finishChangingLanes();
        }
        if (this.current.lane && !this.car.nextLane) {
            this.car.pickNextLane();
        }
    };

    Trajectory.prototype.changeLaneToLeft = function() {
        var nextLane = this.current.lane.leftAdjacent;
        if (!nextLane || this.isChangingLanes) {
            return false;
        }
        var nextPosition = this.current.position + 5 * this.car.length;
        if (nextLane && nextPosition < nextLane.length) {
            this.startChangingLanes(nextLane, nextPosition, false);
        }
    };

    Trajectory.prototype.changeLaneToRight = function() {
        var nextLane = this.current.lane.rightAdjacent;
        if (!nextLane || this.isChangingLanes) {
            return false;
        }
        var nextPosition = this.current.position + 5 * this.car.length;
        if (nextLane && nextPosition < nextLane.length) {
            this.startChangingLanes(nextLane, nextPosition, false);
        }
    };

    Trajectory.prototype.startChangingLanes = function(nextLane, nextPosition, keepOldLine) {
        if (this.isChangingLanes) {
            throw Error("Invalid call order: start/finish changing lanes");
        }

        if (!nextLane) {
            throw Error("No next lane!");
            // this.car.alive = false;
            // return;
        }

        this.isChangingLanes = true;
        this.next.lane = nextLane;
        this.next.position = nextPosition;

        var p1 = this.current.lane.getPoint(this.current.position / this.current.lane.length),
            p2 = this.next.lane.getPoint(this.next.position / this.next.lane.length);
        var distance = p2.subtract(p1).length;
        var control = p1.add(this.current.lane.middleLine.vector.normalize().mult(distance / 2));
        this.temp.lane = new Curve(p1, p2, control);
        this.temp.position = 0;
        this.next.position -= this.temp.lane.length;
        if (!keepOldLine) {
            this.current.release();
        }

        return true;
    };

    Trajectory.prototype.finishChangingLanes = function() {
        if (!this.isChangingLanes) {
            throw Error("Invalid call order: start/finish changing lanes");
        }

        this.isChangingLanes = false;
        this.current.lane = this.next.lane;
        this.current.position = this.next.position || 0;
        this.next.lane = null;
        this.next.position = NaN;
        this.temp.lane = null;
        this.temp.position = NaN;
        this.car.pickNextLane();
        return this.current.lane;
    };

    return Trajectory;
});
