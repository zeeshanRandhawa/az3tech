import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class DriverRouteNode extends Model {
    static associate(models: any) {
        DriverRouteNode.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "nodeId",
            as: "node",
            onDelete: "cascade"
        });
        DriverRouteNode.belongsTo(models.DriverRoute, {
            foreignKey: "drouteId",
            targetKey: "drouteId",
            as: "droute"
        });
    }
}


DriverRouteNode.init(
    {
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
        },
        droutenodeId: {
            type: DataTypes.NUMBER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'droutenodes_droutenode_id_seq\'::regclass)")
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

// DriverRouteNode.removeAttribute("id");

export default DriverRouteNode;
