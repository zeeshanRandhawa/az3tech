import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class RiderRoute extends Model {
    static associate(models: any) {
        RiderRoute.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "originNode",
            as: "origin",
        });
        RiderRoute.hasOne(models.Node, {
            foreignKey: "nodeId",
            sourceKey: "destinationNode",
            as: "destination",
        });
        RiderRoute.belongsTo(models.Rider, {
            foreignKey: "riderId",
            targetKey: "riderId",
            as: "rider",
        });
        RiderRoute.hasMany(models.RiderRouteNode, {
            foreignKey: "rrouteId",
            sourceKey: "rrouteId",
            as: "rrouteNodes",
            onDelete: "CASCADE"
        });
    }
}

RiderRoute.init(
    {
        rrouteId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'rroutes_rroute_id_seq\'::regclass)"),
        },
        riderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        originNode: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        destinationNode: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        departureTime: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        rrouteDbmTag: {
            type: DataTypes.STRING(15),
            allowNull: true,
        },
        timeFlexibility: {
            type: DataTypes.INTEGER,
            allowNull: true,
            validate: {
                min: {
                    args: [-1],
                    msg: `Value of "time_flexibility" must be greater than -1`,
                },
                max: {
                    args: [7],
                    msg: `Value of "time_flexibility" must be less than 7`,
                },
            },
        },
        intermediateNodesList: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    },
    {
        sequelize,
        modelName: "RiderRoute",
        tableName: "rroutes",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);


export default RiderRoute;
