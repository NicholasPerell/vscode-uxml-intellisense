interface StringDict {
    [key: string]: string;
}

interface Theme {
    color: StringDict;
    spacing: string;
    font: StringDict;
    text: StringDict;
    tracking: StringDict;
    breakpoint: StringDict;
    radius: StringDict;
    textShadow: StringDict;

    //Not included in TwCSS?
    backgroundImage: StringDict;
    backgroundPosition: StringDict;
    backgroundSize: StringDict;
    borderWidth: StringDict;
    cursor: StringDict;
    flex: StringDict;
    flexGrow: StringDict;
    flexShrink: StringDict;
    letterSpacing: StringDict;
    opacity: StringDict;
    rotate: StringDict;
    scale: StringDict;
    screens: StringDict;
    slice: StringDict;
    sliceScale: StringDict;
    textOutlineWidth: StringDict;
    transformOrigin: StringDict;
    transitionDelay: StringDict;
    transitionDuration: StringDict;
    transitionProperty: StringDict;
}

interface Settings {
    prefix: string;
    theme: string;
}