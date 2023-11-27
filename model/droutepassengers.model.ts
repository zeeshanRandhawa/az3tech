import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class DriverRoutePassenger extends Model {
    static associate(models: any) {
        DriverRoutePassenger.belongsTo(models.DriverRouteNode, {
            foreignKey: "drouteNodeId",
            targetKey: "drouteNodeId",
            as: "driverRouteNode",
            onDelete: "CASCADE"
        });
        DriverRoutePassenger.belongsTo(models.RiderRoute, {
            foreignKey: "rrouteId",
            targetKey: "rrouteId",
            as: "rroute",
            onDelete: "CASCADE"
        });
    }
}

DriverRoutePassenger.init(
    {
        droutePassengersId: {
            type: DataTypes.BIGINT,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'doutepassengers_droute_passengers_id_seq\'::regclass)")
        },
        rrouteId: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        drouteNodeId: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        rrouteRank: {
            type: DataTypes.INTEGER,
            allowNull: false,
        }
    },
    {
        sequelize,
        modelName: "DriverRoutePassenger",
        tableName: "droutepassengers",
        paranoid: false,
        timestamps: false,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ["rrouteId", "drouteNodeId", "rrouteRank"],
                name: "rrouteid_droutenodeid_rrouterank",
            },
        ]
    }
);

export default DriverRoutePassenger;
