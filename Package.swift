// swift-tools-version: 5.9
import PackageDescription

// @straitlink/capacitor, iOS side: a thin Capacitor plugin over StraitSDK (Swift Package Manager).
let package = Package(
    name: "StraitlinkCapacitor",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "StraitlinkCapacitor", targets: ["StraitPlugin"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/strait-link/strait-sdk-swift.git", from: "0.9.4"),
    ],
    targets: [
        .target(
            name: "StraitPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "StraitSDK", package: "strait-sdk-swift"),
            ],
            path: "ios/Sources/StraitPlugin"
        ),
    ]
)
