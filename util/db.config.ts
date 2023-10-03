require("dotenv").config();
import { Sequelize } from "sequelize";

export const sequelize: any = new Sequelize(
    process.env.IS_PROD === "true" ? process.env.PG_DATABASE_NAME_PROD! : process.env.PG_DATABASE_NAME_DEV!,
    process.env.IS_PROD === "true" ? process.env.PG_USER_PROD! : process.env.PG_USER_DEV!,
    process.env.IS_PROD === "true" ? process.env.PG_PASSWORD_PROD : process.env.PG_PASSWORD_DEV, {
    host: process.env.IS_PROD === "true" ? process.env.PG_HOST_PROD! : process.env.PG_HOST_DEV,
    port: process.env.IS_PROD === "true" ? parseInt(process.env.PG_PORT_PROD!) : parseInt(process.env.PG_PORT_DEV!),
    dialect: "postgres",
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
    , dialectOptions: process.env.IS_PROD === "true" ? {
        ssl: {
            require: true,
            rejectUnauthorized: false,
        }
    } : {}
    , logging: process.env.IS_PROD === "true" ? false : (message: string) => {
        console.log(message + '\n');
    }
});


import Role from "../model/role.model";
import User from "../model/user.model";
import Session from "../model/session.model";
import Rider from "../model/rider.model";
import RiderRoute from "../model/rroute.model";
import RiderRouteNode from "../model/rroutenode.model";
import Driver from "../model/driver.model";
import DriverRoute from "../model/droute.model";
import DriverRouteNode from "../model/droutenode.model";
import Node from "../model/node.model";

User.associate({ Session, Role, Rider, Driver });
Session.associate({ User });

Rider.associate({ User, RiderRoute });
RiderRoute.associate({ Node, Rider, RiderRouteNode });
RiderRouteNode.associate({ Node, RiderRoute });

Driver.associate({ User, DriverRoute });
DriverRoute.associate({ Node, Driver, DriverRouteNode });
DriverRouteNode.associate({ Node, DriverRoute, Driver });

export { User, Role, Session, Rider, Driver, Node, RiderRoute, DriverRoute, RiderRouteNode, DriverRouteNode };
