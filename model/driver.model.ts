import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Driver extends Model {
    static associate(models: any) {
        Driver.belongsTo(models.User, {
            foreignKey: "userId",
            targetKey: "userId",
            as: "user"
        });
        Driver.hasMany(models.DriverRoute, {
            foreignKey: "driverId",
            sourceKey: "driverId",
            as: "droutes",
            onDelete: "CASCADE"
        });
    }
}

Driver.init(
    {
        driverId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'drivers_driver_id_seq\'::regclass)"),
        },
        firstName: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        lastName: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        city: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        stateProvince: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        zipPostalCode: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        capacity: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        profilePicture: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        phoneNumber: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: "Driver",
        tableName: "drivers",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);


export default Driver;
