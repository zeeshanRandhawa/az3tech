import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class DriverRoute extends Model {
    static associate(models: any) {
        DriverRoute.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "originNode",
            as: "origin",
        });
        DriverRoute.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "destinationNode",
            as: "destination",
        });
        DriverRoute.belongsTo(models.Driver, {
            foreignKey: "driverId",
            targetKey: "driverId",
            as: "driver",
        });
        DriverRoute.hasMany(models.DriverRouteNode, {
            foreignKey: "drouteId",
            sourceKey: "drouteId",
            as: "drouteNodes",
            onDelete: "CASCADE"
        });
    }
}

DriverRoute.init(
    {
        drouteId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'droutes_droute_id_seq\'::regclass)")
        },
        originNode: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        destinationNode: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        departureTime: {
            type: DataTypes.DATE,
            allowNull: true
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        maxWait: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        fixedRoute: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: true
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: true
        },
        driverId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        drouteDbmTag: {
            type: DataTypes.STRING(15),
            allowNull: true
        },
        drouteName: {
            type: DataTypes.STRING(150),
            allowNull: true
        },
        departureFlexibility: {
            type: DataTypes.SMALLINT,
            allowNull: true,
        },
        intermediateNodesList: {
            type: DataTypes.TEXT,
            allowNull: true
        },
    },
    {
        sequelize,
        modelName: "DriverRoute",
        tableName: "droutes",
        paranoid: false,
        timestamps: false,
        underscored: true
    }
);


export default DriverRoute;
