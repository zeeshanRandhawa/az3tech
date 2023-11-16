import { Model, DataTypes } from "sequelize";
import { sequelize, Node } from "../util/db.config";

class NodeToNode extends Model {
    static associate(models: any) {
        NodeToNode.belongsTo(Node, {
            foreignKey: "origNodeId",
            targetKey: "nodeId",
            as: "origin",
        });
        NodeToNode.belongsTo(Node, {
            foreignKey: "destNodeId",
            targetKey: "nodeId",
            as: "destination"
        });
    }
}

NodeToNode.init(
    {
        origNodeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        destNodeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true
        },
        distance: {
            type: DataTypes.REAL,
            allowNull: false
        },
        duration: {
            type: DataTypes.REAL,
            allowNull: false
        }
    },
    {
        sequelize,
        modelName: "NodeToNode",
        tableName: "n2n",
        paranoid: false,
        timestamps: false,
        underscored: true,
        indexes: [
            {
                unique: true,
                fields: ["origNodeId", "destNodeId"],
                name: "orig_dest_node_unq",
            },
        ]
    }
);

export default NodeToNode;
