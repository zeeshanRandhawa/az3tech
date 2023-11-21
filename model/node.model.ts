import { Model, DataTypes } from "sequelize";
import { sequelize } from "../util/db.config";

class Node extends Model {
    static associate(models: any) {
    }
}

Node.init(
    {
        nodeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            defaultValue: sequelize.literal("nextval(\'nodes_node_id_seq\'::regclass)"),
        },
        location: {
            type: DataTypes.CHAR(50),
            allowNull: true,
        },
        description: {
            type: DataTypes.CHAR(50),
            allowNull: true,
        },
        address: {
            type: DataTypes.CHAR(50),
            allowNull: true,
        },
        city: {
            type: DataTypes.CHAR(50),
            allowNull: true,
        },
        stateProvince: {
            type: DataTypes.CHAR(50),
            allowNull: true,
        },
        zipPostalCode: {
            type: DataTypes.CHAR(10),
            allowNull: true,
        },
        long: {
            type: DataTypes.REAL,
            allowNull: true,
        },
        lat: {
            type: DataTypes.REAL,
            allowNull: true,
        },
        locid: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        riderTransitTime: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        driverTransitTime: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        n2nCalculated: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
    },
    {
        sequelize,
        modelName: "Node",
        tableName: "nodes",
        paranoid: false,
        timestamps: false,
        underscored: true,
    }
);


export default Node;
