import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class RiderRouteNode extends Model {
    static associate(models: any) {
        RiderRouteNode.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "nodeId",
            as: "node",
            onDelete: "cascade"
        });
        RiderRouteNode.belongsTo(models.RiderRoute, {
            foreignKey: "rrouteId",
            targetKey: "rrouteId",
            as: "rroute",
            onDelete: "cascade"
        });
    }
}

RiderRouteNode.init(
    {
        rrouteId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        drouteId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        riderId: {
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
        rank: {
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
        modelName: "RiderRouteNode",
        tableName: "rroutenodes",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);

RiderRouteNode.removeAttribute("id");

export default RiderRouteNode;
