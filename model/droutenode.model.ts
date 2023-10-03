import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class DriverRouteNode extends Model {
    static associate(models: any) {
        DriverRouteNode.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "nodeId",
            as: "node",
        });
        DriverRouteNode.belongsTo(models.DriverRoute, {
            foreignKey: "drouteId",
            targetKey: "drouteId",
            as: "droute"
        });
        DriverRouteNode.belongsTo(models.Driver, {
            foreignKey: "outbDriverId",
            targetKey: "driverId",
            as: "driver"
        });
    }
}

DriverRouteNode.init(
    {
        drouteNodeId: {
            type: DataTypes.NUMBER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'droutenodes_droute_node_id_seq\'::regclass)")
        },
        drouteId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        outbDriverId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        nodeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        permutationId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        arrivalTime: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        departureTime: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        maxWait: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        rank: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        capacityUsed: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        cumDistance: {
            type: DataTypes.REAL,
            allowNull: true,
        },
        cumTime: {
            type: DataTypes.REAL,
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: true,
        }
    },
    {
        sequelize,
        modelName: "DriverRouteNode",
        tableName: "droutenodes",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);

export default DriverRouteNode;
